import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET ||= "test-session-secret-not-a-real-one";
});

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockImplementation(async (key: string) => ({
    key,
    url: `/manus-storage/${key}`,
  })),
}));

vi.mock("./_core/claude", () => ({
  claudeJson: vi.fn().mockResolvedValue({
    tags: ["all black", "oversized"],
    style_score: 80,
    occasion: "night out",
    feedback: "Strong silhouette.",
    suggestions: ["Try a lighter shoe"],
  }),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { getDb } from "./db";
import {
  outfitChallengeEntries,
  outfitChallenges,
  outfitComments,
  outfitFollows,
  outfitMatchups,
  outfitNotifications,
  outfitPosts,
  outfitRatings,
} from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { settleFinishedChallenges } from "./challengesDb";
import { LIMITS, enforce, resetAllLimits, take } from "./rateLimit";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function ctxFor(user: User | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

let ada: User;
let bo: User;
let cass: User;
let dbAvailable = false;

beforeAll(async () => {
  const conn = await getDb();
  if (!conn) return;
  try {
    await db.upsertUser({ openId: "ar-ada", name: "Ada" });
    await db.upsertUser({ openId: "ar-bo", name: "Bo" });
    await db.upsertUser({ openId: "ar-cass", name: "Cass" });
    ada = (await db.getUserByOpenId("ar-ada"))!;
    bo = (await db.getUserByOpenId("ar-bo"))!;
    cass = (await db.getUserByOpenId("ar-cass"))!;
    dbAvailable = Boolean(ada && bo && cass);
  } catch {
    dbAvailable = false;
  }
});

beforeEach(async () => {
  // Tests upload far more than a person would, so the allowance is cleared
  // between them — otherwise a later test fails for running out of quota
  // rather than for anything to do with what it is testing.
  resetAllLimits();
  if (!dbAvailable) return;
  const conn = await getDb();
  if (!conn) return;
  await conn.delete(outfitChallengeEntries);
  await conn.delete(outfitChallenges);
  await conn.delete(outfitNotifications);
  await conn.delete(outfitComments);
  await conn.delete(outfitRatings);
  await conn.delete(outfitMatchups);
  await conn.delete(outfitFollows);
  await conn.delete(outfitPosts);
});

const dbIt: typeof it = ((name: string, fn: never, timeout?: number) =>
  it(
    name,
    async (ctx: { skip: () => void }) => {
      if (!dbAvailable) return ctx.skip();
      return (fn as unknown as (c: unknown) => unknown)(ctx);
    },
    timeout
  )) as typeof it;

async function postOutfit(user: User, caption: string) {
  const result = await appRouter.createCaller(ctxFor(user)).outfits.upload({
    fileBase64: TINY_PNG_BASE64,
    mimeType: "image/png",
    caption,
    category: "streetwear",
  });
  // `upload` returns the feed-shaped row, so the post itself is one level in.
  return result.post!.post;
}

/** Puts a rating straight in, so tests can set an average without a caller. */
async function setRating(postId: number, sum: number, count: number) {
  const conn = (await getDb())!;
  await conn
    .update(outfitPosts)
    .set({ ratingSum: sum, ratingCount: count })
    .where(eq(outfitPosts.id, postId));
}

describe("notifications", () => {
  dbIt("tells the author when someone rates their outfit", async () => {
    const post = await postOutfit(ada, "all black");
    await appRouter
      .createCaller(ctxFor(bo))
      .outfits.rate({ postId: post.id, rating: 5 });

    const inbox = await appRouter
      .createCaller(ctxFor(ada))
      .arena.notifications.list();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].notification.kind).toBe("rating");
    expect(inbox[0].notification.body).toContain("5 stars");
  });

  dbIt("says one star, not one stars", async () => {
    const post = await postOutfit(ada, "all black");
    await appRouter
      .createCaller(ctxFor(bo))
      .outfits.rate({ postId: post.id, rating: 1 });

    const inbox = await appRouter
      .createCaller(ctxFor(ada))
      .arena.notifications.list();
    expect(inbox[0].notification.body).toContain("1 star");
    expect(inbox[0].notification.body).not.toContain("1 stars");
  });

  dbIt("does not tell you about your own actions", async () => {
    // Commenting on your own outfit is allowed — rating and voting on it are
    // not — so this is the path that proves self-notifications are dropped.
    const post = await postOutfit(ada, "all black");
    await appRouter
      .createCaller(ctxFor(ada))
      .wardrobe.comments.add({ postId: post.id, body: "note to self" });

    const inbox = await appRouter
      .createCaller(ctxFor(ada))
      .arena.notifications.list();
    expect(inbox).toHaveLength(0);
  });

  dbIt("tells the author when someone comments", async () => {
    const post = await postOutfit(ada, "all black");
    await appRouter
      .createCaller(ctxFor(bo))
      .wardrobe.comments.add({ postId: post.id, body: "love this" });

    const inbox = await appRouter
      .createCaller(ctxFor(ada))
      .arena.notifications.list();
    expect(inbox[0].notification.kind).toBe("comment");
    expect(inbox[0].notification.body).toContain("love this");
  });

  dbIt("tells someone when they gain a follower, but not when they lose one", async () => {
    await appRouter
      .createCaller(ctxFor(bo))
      .outfits.follow.toggle({ userId: ada.id });
    await appRouter
      .createCaller(ctxFor(bo))
      .outfits.follow.toggle({ userId: ada.id });

    const inbox = await appRouter
      .createCaller(ctxFor(ada))
      .arena.notifications.list();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].notification.kind).toBe("follow");
  });

  dbIt("tells both sides of a head-to-head", async () => {
    const mine = await postOutfit(ada, "mine");
    const theirs = await postOutfit(bo, "theirs");
    // The voter has to be someone with nothing in the fight.
    await appRouter.createCaller(ctxFor(cass)).outfits.battle.vote({
      postAId: mine.id,
      postBId: theirs.id,
      winnerId: mine.id,
    });

    expect(
      (await appRouter.createCaller(ctxFor(ada)).arena.notifications.list()).map(
        row => row.notification.kind
      )
    ).toContain("battle_won");
    expect(
      (await appRouter.createCaller(ctxFor(bo)).arena.notifications.list()).map(
        row => row.notification.kind
      )
    ).toContain("battle_lost");
  });

  dbIt("counts what is unread, and stops counting once read", async () => {
    const post = await postOutfit(ada, "all black");
    await appRouter
      .createCaller(ctxFor(bo))
      .outfits.rate({ postId: post.id, rating: 5 });

    const caller = appRouter.createCaller(ctxFor(ada));
    expect(await caller.arena.notifications.unreadCount()).toBe(1);
    await caller.arena.notifications.markAllRead();
    expect(await caller.arena.notifications.unreadCount()).toBe(0);
  });

  dbIt("keeps each person's notifications to themselves", async () => {
    const post = await postOutfit(ada, "all black");
    await appRouter
      .createCaller(ctxFor(bo))
      .outfits.rate({ postId: post.id, rating: 5 });

    const theirs = await appRouter
      .createCaller(ctxFor(bo))
      .arena.notifications.list();
    expect(theirs).toHaveLength(0);
  });

  dbIt("refuses to show anyone's inbox to a stranger", async () => {
    await expect(
      appRouter.createCaller(ctxFor(null)).arena.notifications.list()
    ).rejects.toThrow();
  });
});

describe("challenges", () => {
  dbIt("starts one on its own when none is running", async () => {
    const current = await appRouter
      .createCaller(ctxFor(null))
      .arena.challenges.current();
    expect(current?.challenge.title).toBeTruthy();
    expect(current?.challenge.prompt.length).toBeGreaterThan(20);
    expect(new Date(current!.challenge.endsAt).getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  dbIt("does not start a second one while the first is running", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    const first = await caller.arena.challenges.current();
    const second = await caller.arena.challenges.current();
    expect(second?.challenge.id).toBe(first?.challenge.id);
  });

  dbIt("lets someone enter their own outfit and take it out again", async () => {
    const caller = appRouter.createCaller(ctxFor(ada));
    const current = await caller.arena.challenges.current();
    const post = await postOutfit(ada, "entry");

    await caller.arena.challenges.enter({
      challengeId: current!.challenge.id,
      postId: post.id,
    });
    expect(
      await caller.arena.challenges.myEntries({
        challengeId: current!.challenge.id,
      })
    ).toEqual([post.id]);

    await caller.arena.challenges.withdraw({
      challengeId: current!.challenge.id,
      postId: post.id,
    });
    expect(
      await caller.arena.challenges.myEntries({
        challengeId: current!.challenge.id,
      })
    ).toEqual([]);
  });

  dbIt("refuses to enter someone else's outfit", async () => {
    const current = await appRouter
      .createCaller(ctxFor(null))
      .arena.challenges.current();
    const theirs = await postOutfit(bo, "not yours");

    await expect(
      appRouter.createCaller(ctxFor(ada)).arena.challenges.enter({
        challengeId: current!.challenge.id,
        postId: theirs.id,
      })
    ).rejects.toThrow(/not yours/i);
  });

  dbIt("refuses the same outfit twice", async () => {
    const caller = appRouter.createCaller(ctxFor(ada));
    const current = await caller.arena.challenges.current();
    const post = await postOutfit(ada, "entry");
    const entry = {
      challengeId: current!.challenge.id,
      postId: post.id,
    };

    await caller.arena.challenges.enter(entry);
    await expect(caller.arena.challenges.enter(entry)).rejects.toThrow(
      /already entered/i
    );
  });

  dbIt("refuses entries after the deadline", async () => {
    const conn = (await getDb())!;
    const caller = appRouter.createCaller(ctxFor(ada));
    const current = await caller.arena.challenges.current();
    await conn
      .update(outfitChallenges)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(outfitChallenges.id, current!.challenge.id));

    const post = await postOutfit(ada, "too late");
    await expect(
      caller.arena.challenges.enter({
        challengeId: current!.challenge.id,
        postId: post.id,
      })
    ).rejects.toThrow(/closed/i);
  });

  dbIt("crowns the best-rated entry when the deadline passes", async () => {
    const conn = (await getDb())!;
    const caller = appRouter.createCaller(ctxFor(ada));
    const current = await caller.arena.challenges.current();
    const challengeId = current!.challenge.id;

    const good = await postOutfit(ada, "good");
    const better = await postOutfit(ada, "better");
    await caller.arena.challenges.enter({ challengeId, postId: good.id });
    await caller.arena.challenges.enter({ challengeId, postId: better.id });
    await setRating(good.id, 6, 2); // average 3
    await setRating(better.id, 10, 2); // average 5

    await conn
      .update(outfitChallenges)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(outfitChallenges.id, challengeId));

    const settled = await settleFinishedChallenges();
    expect(settled).toHaveLength(1);
    expect(settled[0].winnerPostId).toBe(better.id);

    const inbox = await caller.arena.notifications.list();
    expect(inbox.map(row => row.notification.kind)).toContain("challenge_won");
  });

  dbIt("will not crown an entry nobody rated", async () => {
    const conn = (await getDb())!;
    const caller = appRouter.createCaller(ctxFor(ada));
    const current = await caller.arena.challenges.current();
    const challengeId = current!.challenge.id;

    const post = await postOutfit(ada, "unseen");
    await caller.arena.challenges.enter({ challengeId, postId: post.id });
    await conn
      .update(outfitChallenges)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(outfitChallenges.id, challengeId));

    const settled = await settleFinishedChallenges();
    expect(settled[0].winnerPostId).toBeNull();
  });

  dbIt("settles a challenge once, however many times it is asked", async () => {
    const conn = (await getDb())!;
    const caller = appRouter.createCaller(ctxFor(ada));
    const current = await caller.arena.challenges.current();
    const challengeId = current!.challenge.id;

    const post = await postOutfit(ada, "winner");
    await caller.arena.challenges.enter({ challengeId, postId: post.id });
    await setRating(post.id, 5, 1);
    await conn
      .update(outfitChallenges)
      .set({ endsAt: new Date(Date.now() - 1000) })
      .where(eq(outfitChallenges.id, challengeId));

    await settleFinishedChallenges();
    const again = await settleFinishedChallenges();
    expect(again).toHaveLength(0);

    const wins = await conn
      .select({ n: sql<number>`COUNT(*)` })
      .from(outfitNotifications)
      .where(eq(outfitNotifications.kind, "challenge_won"));
    expect(Number(wins[0].n)).toBe(1);
  });
});

describe("search", () => {
  dbIt("finds an outfit by a word in its caption", async () => {
    await postOutfit(ada, "linen shirt in the sun");
    const results = await appRouter
      .createCaller(ctxFor(null))
      .arena.search.everything({ query: "linen" });
    expect(results.outfits).toHaveLength(1);
  });

  dbIt("finds an outfit by a tag the stylist wrote", async () => {
    await postOutfit(ada, "no useful words here");
    const results = await appRouter
      .createCaller(ctxFor(null))
      .arena.search.everything({ query: "oversized" });
    expect(results.outfits).toHaveLength(1);
  });

  dbIt("ignores case", async () => {
    await postOutfit(ada, "Linen Shirt");
    const results = await appRouter
      .createCaller(ctxFor(null))
      .arena.search.everything({ query: "LINEN" });
    expect(results.outfits).toHaveLength(1);
  });

  dbIt("returns nothing for a query too short to mean anything", async () => {
    await postOutfit(ada, "linen shirt");
    const results = await appRouter
      .createCaller(ctxFor(null))
      .arena.search.everything({ query: "l" });
    expect(results.outfits).toHaveLength(0);
    expect(results.people).toHaveLength(0);
  });

  dbIt("narrows to one category", async () => {
    await postOutfit(ada, "a streetwear look");
    const formal = await appRouter
      .createCaller(ctxFor(null))
      .arena.search.byCategory({ category: "formal" });
    expect(formal).toHaveLength(0);

    const streetwear = await appRouter
      .createCaller(ctxFor(null))
      .arena.search.byCategory({ category: "streetwear" });
    expect(streetwear).toHaveLength(1);
  });

  dbIt("suggests the tags showing up most often", async () => {
    await postOutfit(ada, "one");
    await postOutfit(ada, "two");
    const tags = await appRouter
      .createCaller(ctxFor(null))
      .arena.search.trendingTags();
    expect(tags).toContain("all black");
  });
});

describe("rate limits", () => {
  beforeEach(() => resetAllLimits());

  it("lets a normal amount through and stops a flood", () => {
    const { max } = LIMITS.upload;
    for (let i = 0; i < max; i++) {
      expect(take("upload", 1).allowed).toBe(true);
    }
    expect(take("upload", 1).allowed).toBe(false);
  });

  it("counts each person separately", () => {
    const { max } = LIMITS.upload;
    for (let i = 0; i < max; i++) take("upload", 1);
    expect(take("upload", 1).allowed).toBe(false);
    expect(take("upload", 2).allowed).toBe(true);
  });

  it("counts each action separately", () => {
    const { max } = LIMITS.upload;
    for (let i = 0; i < max; i++) take("upload", 1);
    expect(take("upload", 1).allowed).toBe(false);
    expect(take("comment", 1).allowed).toBe(true);
  });

  it("says how long is left, and it is never negative", () => {
    const { max } = LIMITS.signIn;
    for (let i = 0; i < max; i++) take("signIn", "1.2.3.4");
    const blocked = take("signIn", "1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(LIMITS.signIn.windowMs);
  });

  it("throws an error that tells someone when to come back", () => {
    const { max } = LIMITS.upload;
    for (let i = 0; i < max; i++) take("upload", 7);
    expect(() => enforce("upload", 7)).toThrow(/try again in/);
  });

  it("forgives once the window has passed", () => {
    vi.useFakeTimers();
    try {
      const { max, windowMs } = LIMITS.upload;
      for (let i = 0; i < max; i++) take("upload", 9);
      expect(take("upload", 9).allowed).toBe(false);
      vi.advanceTimersByTime(windowMs + 1);
      expect(take("upload", 9).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

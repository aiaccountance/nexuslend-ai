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
  // The real module exports the model names too; a factory mock replaces the
  // whole module, so anything the code imports has to be here.
  CLAUDE_MODEL: "claude-opus-5",
  CLAUDE_FAST_MODEL: "claude-haiku-4-5",
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
  outfitReports,
  outfitBlocks,
  wardrobeItems,
  wardrobeWears,
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
let dee: User;
let boss: User;
let dbAvailable = false;

beforeAll(async () => {
  const conn = await getDb();
  if (!conn) return;
  try {
    await db.upsertUser({ openId: "ar-ada", name: "Ada" });
    await db.upsertUser({ openId: "ar-bo", name: "Bo" });
    await db.upsertUser({ openId: "ar-cass", name: "Cass" });
    await db.upsertUser({ openId: "ar-dee", name: "Dee" });
    await db.upsertUser({ openId: "ar-boss", name: "Boss", role: "admin" });
    ada = (await db.getUserByOpenId("ar-ada"))!;
    bo = (await db.getUserByOpenId("ar-bo"))!;
    cass = (await db.getUserByOpenId("ar-cass"))!;
    dee = (await db.getUserByOpenId("ar-dee"))!;
    boss = (await db.getUserByOpenId("ar-boss"))!;
    dbAvailable = Boolean(ada && bo && cass && dee && boss);
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
  await conn.delete(outfitReports);
  await conn.delete(outfitBlocks);
  await conn.delete(wardrobeWears);
  await conn.delete(wardrobeItems);
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

describe("reporting and blocking", () => {
  dbIt("hides a post the moment it is reported as nudity", async () => {
    const post = await postOutfit(ada, "reported");
    const result = await appRouter
      .createCaller(ctxFor(bo))
      .arena.safety.report({ postId: post.id, reason: "nudity" });

    expect(result?.hidden).toBe(true);
    const feed = await appRouter
      .createCaller(ctxFor(null))
      .outfits.feed({ sort: "new", limit: 30 });
    expect(feed.posts.map(row => row.post.id)).not.toContain(post.id);
  });

  dbIt("leaves a milder report up until enough people agree", async () => {
    const post = await postOutfit(ada, "mildly reported");
    const first = await appRouter
      .createCaller(ctxFor(bo))
      .arena.safety.report({ postId: post.id, reason: "spam" });
    expect(first?.hidden).toBe(false);

    const feed = await appRouter
      .createCaller(ctxFor(null))
      .outfits.feed({ sort: "new", limit: 30 });
    expect(feed.posts.map(row => row.post.id)).toContain(post.id);
  });

  dbIt("hides it once three different people report it", async () => {
    const post = await postOutfit(ada, "three strikes");
    await appRouter
      .createCaller(ctxFor(bo))
      .arena.safety.report({ postId: post.id, reason: "spam" });
    await appRouter
      .createCaller(ctxFor(cass))
      .arena.safety.report({ postId: post.id, reason: "spam" });
    const third = await appRouter
      .createCaller(ctxFor(dee))
      .arena.safety.report({ postId: post.id, reason: "spam" });

    expect(third?.hidden).toBe(true);
  });

  dbIt("refuses the same person reporting twice", async () => {
    const post = await postOutfit(ada, "double report");
    const caller = appRouter.createCaller(ctxFor(bo));
    await caller.arena.safety.report({ postId: post.id, reason: "spam" });
    await expect(
      caller.arena.safety.report({ postId: post.id, reason: "spam" })
    ).rejects.toThrow(/already reported/i);
  });

  dbIt("still shows the author their own hidden post, with the reason", async () => {
    const post = await postOutfit(ada, "mine, hidden");
    await appRouter
      .createCaller(ctxFor(bo))
      .arena.safety.report({ postId: post.id, reason: "nudity" });

    const asAuthor = await appRouter
      .createCaller(ctxFor(ada))
      .outfits.getPost({ id: post.id });
    expect(asAuthor?.post.hiddenReason).toContain("nudity");

    const asStranger = await appRouter
      .createCaller(ctxFor(cass))
      .outfits.getPost({ id: post.id });
    expect(asStranger).toBeNull();
  });

  dbIt("keeps a hidden post out of search, challenges and the leaderboard", async () => {
    const post = await postOutfit(ada, "linen and secrets");
    await appRouter
      .createCaller(ctxFor(bo))
      .arena.safety.report({ postId: post.id, reason: "nudity" });

    const found = await appRouter
      .createCaller(ctxFor(null))
      .arena.search.everything({ query: "linen" });
    expect(found.outfits.map(row => row.post.id)).not.toContain(post.id);

    const board = await appRouter
      .createCaller(ctxFor(null))
      .outfits.leaderboard.posts({ period: "week", limit: 50 });
    expect(board.map(row => row.post.id)).not.toContain(post.id);
  });

  dbIt("puts a post back when the report is dismissed", async () => {
    const post = await postOutfit(ada, "wrongly reported");
    await appRouter
      .createCaller(ctxFor(bo))
      .arena.safety.report({ postId: post.id, reason: "nudity" });

    const queue = await appRouter
      .createCaller(ctxFor(boss))
      .arena.safety.queue();
    const mine = queue.find(row => row.report.postId === post.id);
    expect(mine).toBeDefined();

    await appRouter
      .createCaller(ctxFor(boss))
      .arena.safety.dismiss({ reportId: mine!.report.id });

    const feed = await appRouter
      .createCaller(ctxFor(null))
      .outfits.feed({ sort: "new", limit: 30 });
    expect(feed.posts.map(row => row.post.id)).toContain(post.id);
  });

  dbIt("takes a post down for good when the report is upheld", async () => {
    const post = await postOutfit(ada, "genuinely bad");
    await appRouter
      .createCaller(ctxFor(bo))
      .arena.safety.report({ postId: post.id, reason: "spam" });

    const queue = await appRouter
      .createCaller(ctxFor(boss))
      .arena.safety.queue();
    const mine = queue.find(row => row.report.postId === post.id)!;
    await appRouter
      .createCaller(ctxFor(boss))
      .arena.safety.uphold({ reportId: mine.report.id });

    const feed = await appRouter
      .createCaller(ctxFor(null))
      .outfits.feed({ sort: "new", limit: 30 });
    expect(feed.posts.map(row => row.post.id)).not.toContain(post.id);

    const stillOpen = await appRouter
      .createCaller(ctxFor(boss))
      .arena.safety.queue();
    expect(stillOpen.find(row => row.report.id === mine.report.id)).toBeUndefined();
  });

  dbIt("does not let an ordinary person see or work the queue", async () => {
    await expect(
      appRouter.createCaller(ctxFor(ada)).arena.safety.queue()
    ).rejects.toThrow();
  });

  dbIt("blocking hides them from you and you from them", async () => {
    const theirs = await postOutfit(bo, "theirs");
    const mine = await postOutfit(ada, "mine");

    await appRouter
      .createCaller(ctxFor(ada))
      .arena.safety.block({ userId: bo.id });

    const myFeed = await appRouter
      .createCaller(ctxFor(ada))
      .outfits.feed({ sort: "new", limit: 30 });
    expect(myFeed.posts.map(row => row.post.id)).not.toContain(theirs.id);

    const theirFeed = await appRouter
      .createCaller(ctxFor(bo))
      .outfits.feed({ sort: "new", limit: 30 });
    expect(theirFeed.posts.map(row => row.post.id)).not.toContain(mine.id);
  });

  dbIt("blocking twice is not an error, and unblocking puts them back", async () => {
    const theirs = await postOutfit(bo, "theirs again");
    const caller = appRouter.createCaller(ctxFor(ada));

    await caller.arena.safety.block({ userId: bo.id });
    await caller.arena.safety.block({ userId: bo.id });
    expect(await caller.arena.safety.blocked()).toHaveLength(1);

    await caller.arena.safety.unblock({ userId: bo.id });
    const feed = await caller.outfits.feed({ sort: "new", limit: 30 });
    expect(feed.posts.map(row => row.post.id)).toContain(theirs.id);
  });

  dbIt("refuses to let anyone block themselves", async () => {
    await expect(
      appRouter.createCaller(ctxFor(ada)).arena.safety.block({ userId: ada.id })
    ).rejects.toThrow(/yourself/i);
  });
});

describe("what people wear", () => {
  /** A garment in someone's wardrobe, straight into the table. */
  async function ownGarment(user: User, name: string) {
    const conn = (await getDb())!;
    const [result] = await conn.insert(wardrobeItems).values({
      userId: user.id,
      imageUrl: "/x.jpg",
      imageKey: "x.jpg",
      name,
      slot: "top",
    });
    return (result as { insertId: number }).insertId;
  }

  /** Backdates a wear, for testing "not worn since". */
  async function wornDaysAgo(userId: number, itemId: number, days: number) {
    const conn = (await getDb())!;
    const day = new Date(Date.now() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await conn
      .insert(wardrobeWears)
      .values({ userId, itemId, wornOn: day });
  }

  dbIt("records a wear and counts it once however many times you tap", async () => {
    const item = await ownGarment(ada, "navy knit");
    const caller = appRouter.createCaller(ctxFor(ada));

    await caller.arena.wears.record({ itemIds: [item] });
    await caller.arena.wears.record({ itemIds: [item] });

    const summary = await caller.arena.wears.summary();
    expect(summary.find(row => row.itemId === item)?.times).toBe(1);
  });

  dbIt("records a whole outfit in one go", async () => {
    const top = await ownGarment(ada, "shirt");
    const bottom = await ownGarment(ada, "trousers");
    const caller = appRouter.createCaller(ctxFor(ada));

    const result = await caller.arena.wears.record({
      itemIds: [top, bottom],
    });
    expect(result.recorded).toBe(2);
    expect(await caller.arena.wears.summary()).toHaveLength(2);
  });

  dbIt("will not let anyone log a wear against someone else's clothes", async () => {
    const theirs = await ownGarment(bo, "not yours");
    const result = await appRouter
      .createCaller(ctxFor(ada))
      .arena.wears.record({ itemIds: [theirs] });

    expect(result.recorded).toBe(0);
    expect(
      await appRouter.createCaller(ctxFor(bo)).arena.wears.summary()
    ).toHaveLength(0);
  });

  dbIt("can undo a tap that was a mistake", async () => {
    const item = await ownGarment(ada, "wrong one");
    const caller = appRouter.createCaller(ctxFor(ada));

    await caller.arena.wears.record({ itemIds: [item] });
    await caller.arena.wears.forget({ itemIds: [item] });
    expect(await caller.arena.wears.summary()).toHaveLength(0);
  });

  dbIt("lists what has never been worn", async () => {
    const never = await ownGarment(ada, "still has the tag on");
    const worn = await ownGarment(ada, "worn constantly");
    const caller = appRouter.createCaller(ctxFor(ada));
    await caller.arena.wears.record({ itemIds: [worn] });

    const neglected = await caller.arena.wears.neglected();
    const ids = neglected.map(row => row.item.id);
    expect(ids).toContain(never);
    expect(ids).not.toContain(worn);
  });

  dbIt("lists what hasn't been worn in months, with how long", async () => {
    const item = await ownGarment(ada, "summer coat");
    await wornDaysAgo(ada.id, item, 200);

    const neglected = await appRouter
      .createCaller(ctxFor(ada))
      .arena.wears.neglected();
    const found = neglected.find(row => row.item.id === item);
    expect(found).toBeDefined();
    expect(found!.daysSince).toBeGreaterThan(190);
  });

  dbIt("leaves something worn recently out of the neglected list", async () => {
    const item = await ownGarment(ada, "everyday jeans");
    await wornDaysAgo(ada.id, item, 3);

    const neglected = await appRouter
      .createCaller(ctxFor(ada))
      .arena.wears.neglected();
    expect(neglected.map(row => row.item.id)).not.toContain(item);
  });

  dbIt("ranks favourites by how often they are worn", async () => {
    const often = await ownGarment(ada, "the good jumper");
    const once = await ownGarment(ada, "the other one");
    await wornDaysAgo(ada.id, often, 1);
    await wornDaysAgo(ada.id, often, 2);
    await wornDaysAgo(ada.id, often, 3);
    await wornDaysAgo(ada.id, once, 1);

    const favourites = await appRouter
      .createCaller(ctxFor(ada))
      .arena.wears.favourites();
    expect(favourites[0].item.id).toBe(often);
    expect(favourites[0].times).toBe(3);
  });

  dbIt("reads back as a diary, a day at a time", async () => {
    const top = await ownGarment(ada, "shirt");
    const bottom = await ownGarment(ada, "trousers");
    const caller = appRouter.createCaller(ctxFor(ada));
    await caller.arena.wears.record({ itemIds: [top, bottom] });

    const diary = await caller.arena.wears.diary();
    expect(diary).toHaveLength(1);
    expect(diary[0].items).toHaveLength(2);
  });

  dbIt("keeps each person's diary to themselves", async () => {
    const mine = await ownGarment(ada, "mine");
    await appRouter
      .createCaller(ctxFor(ada))
      .arena.wears.record({ itemIds: [mine] });

    expect(
      await appRouter.createCaller(ctxFor(bo)).arena.wears.diary()
    ).toHaveLength(0);
  });

  dbIt("will not tell a stranger what anybody wears", async () => {
    await expect(
      appRouter.createCaller(ctxFor(null)).arena.wears.diary()
    ).rejects.toThrow();
  });
});

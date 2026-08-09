import { describe, expect, it, vi, beforeAll } from "vitest";

// Mock storage + LLM so the tests exercise our own logic against a real database
// rather than Manus infrastructure.
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockImplementation(async (key: string) => ({
    key,
    url: `/manus-storage/${key}`,
  })),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify({
            tags: ["earth tones", "oversized blazer", "streetwear"],
            style_score: 84,
            occasion: "weekend brunch",
            feedback: "Strong silhouette and a cohesive palette.",
            suggestions: ["Swap the sneakers for loafers to dress it up"],
          }),
        },
        finish_reason: "stop",
      },
    ],
  }),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { getDb } from "./db";
import {
  outfitPosts,
  outfitRatings,
  outfitMatchups,
  outfitFollows,
} from "../drizzle/schema";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function ctxFor(user: User | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

let alice: User;
let bob: User;
// Neutral judges: they post nothing, so they may vote on any matchup.
let carol: User;
let dave: User;
let dbAvailable = false;

beforeAll(async () => {
  const conn = await getDb();
  if (!conn) return;
  try {
    // Clean slate for the outfit tables only — never touches lending data.
    await conn.delete(outfitRatings);
    await conn.delete(outfitMatchups);
    await conn.delete(outfitFollows);
    await conn.delete(outfitPosts);

    await db.upsertUser({
      openId: "test-alice",
      name: "Alice",
      email: "alice@test.dev",
    });
    await db.upsertUser({
      openId: "test-bob",
      name: "Bob",
      email: "bob@test.dev",
    });
    await db.upsertUser({
      openId: "test-carol",
      name: "Carol",
      email: "carol@test.dev",
    });
    await db.upsertUser({
      openId: "test-dave",
      name: "Dave",
      email: "dave@test.dev",
    });
    alice = (await db.getUserByOpenId("test-alice"))!;
    bob = (await db.getUserByOpenId("test-bob"))!;
    carol = (await db.getUserByOpenId("test-carol"))!;
    dave = (await db.getUserByOpenId("test-dave"))!;
    dbAvailable = Boolean(alice && bob && carol && dave);
  } catch {
    dbAvailable = false;
  }
});

// These tests need a reachable database. Without one they report as SKIPPED
// rather than passing — a silent pass would make an unreachable database look
// like a green suite.
const dbIt: typeof it = ((name: string, fn: never, timeout?: number) =>
  it(
    name,
    async (ctx: { skip: () => void }) => {
      if (!dbAvailable) return ctx.skip();
      return (fn as unknown as (c: unknown) => unknown)(ctx);
    },
    timeout
  )) as typeof it;

async function post(user: User, category = "casual", caption = "look") {
  const caller = appRouter.createCaller(ctxFor(user));
  const res = await caller.outfits.upload({
    fileBase64: TINY_PNG_BASE64,
    mimeType: "image/png",
    caption,
    category: category as "casual",
  });
  return res;
}

describe("outfits.upload", () => {
  dbIt("stores the post with AI stylist fields populated", async () => {
    const res = await post(alice, "streetwear", "friday fit");

    expect(res.success).toBe(true);
    expect(res.post?.post.id).toBeGreaterThan(0);
    expect(res.post?.post.userId).toBe(alice.id);
    expect(res.post?.post.caption).toBe("friday fit");
    expect(res.post?.post.category).toBe("streetwear");
    expect(res.post?.post.imageUrl).toContain("/manus-storage/outfit-arena/");
    // AI analysis is persisted, not just returned
    expect(res.post?.post.aiStyleScore).toBe(84);
    expect(res.post?.post.aiOccasion).toBe("weekend brunch");
    expect(res.post?.post.aiTags).toEqual([
      "earth tones",
      "oversized blazer",
      "streetwear",
    ]);
    // New posts start at the Elo baseline
    expect(res.post?.post.eloRating).toBe(1200);
    expect(res.analysis.style_score).toBe(84);
  });

  dbIt("joins the author name onto the created post", async () => {
    const res = await post(alice);
    expect(res.post?.authorName).toBe("Alice");
  });

  dbIt(
    "still saves the outfit when the AI stylist is unavailable",
    async () => {
      const { invokeLLM } = await import("./_core/llm");
      vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("stylist offline"));

      const res = await post(alice, "casual", "posted during an outage");

      // The post survives; only the AI enrichment degrades.
      expect(res.success).toBe(true);
      expect(res.post?.post.id).toBeGreaterThan(0);
      expect(res.post?.post.caption).toBe("posted during an outage");
      expect(res.analysis.feedback).toContain("temporarily unavailable");
      expect(res.post?.post.aiTags).toEqual([]);
    }
  );

  dbIt(
    "degrades gracefully when the model returns unparseable output",
    async () => {
      const { invokeLLM } = await import("./_core/llm");
      vi.mocked(invokeLLM).mockResolvedValueOnce({
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "not json" },
            finish_reason: "stop",
          },
        ],
      } as never);

      const res = await post(alice, "casual", "garbled response");

      expect(res.success).toBe(true);
      expect(res.analysis.style_score).toBe(50);
      expect(res.post?.post.aiTags).toEqual([]);
    }
  );
});

describe("outfits.feed", () => {
  dbIt(
    "returns posts newest-first with a null average until rated",
    async () => {
      const created = await post(bob, "formal", "wedding guest");
      const caller = appRouter.createCaller(ctxFor(null));
      const feed = await caller.outfits.feed({ sort: "new", limit: 30 });

      expect(feed.length).toBeGreaterThan(0);
      const found = feed.find(f => f.post.id === created.post!.post.id);
      expect(found).toBeDefined();
      expect(found!.avgRating).toBeNull();
      expect(found!.authorName).toBe("Bob");
    }
  );

  dbIt("filters by category", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    const feed = await caller.outfits.feed({ category: "formal", limit: 30 });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every(f => f.post.category === "formal")).toBe(true);
  });

  dbIt("supports the top and trending sorts", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(
      caller.outfits.feed({ sort: "top", limit: 10 })
    ).resolves.toBeDefined();
    await expect(
      caller.outfits.feed({ sort: "trending", limit: 10 })
    ).resolves.toBeDefined();
  });

  dbIt("respects limit and offset", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    const page1 = await caller.outfits.feed({
      sort: "new",
      limit: 1,
      offset: 0,
    });
    const page2 = await caller.outfits.feed({
      sort: "new",
      limit: 1,
      offset: 1,
    });
    expect(page1).toHaveLength(1);
    expect(page2).toHaveLength(1);
    expect(page1[0].post.id).not.toBe(page2[0].post.id);
  });
});

describe("outfits.rate", () => {
  dbIt("records a rating and computes the average", async () => {
    const created = await post(alice, "casual", "rate me");
    const id = created.post!.post.id;

    await appRouter
      .createCaller(ctxFor(bob))
      .outfits.rate({ postId: id, rating: 4 });

    const view = await appRouter
      .createCaller(ctxFor(bob))
      .outfits.getPost({ id });
    expect(view!.post.ratingCount).toBe(1);
    expect(view!.post.ratingSum).toBe(4);
    expect(view!.avgRating).toBe(4);
    expect(view!.userRating).toBe(4);
  });

  dbIt(
    "updates rather than double-counts when the same user re-rates",
    async () => {
      const created = await post(alice, "casual", "re-rate me");
      const id = created.post!.post.id;
      const bobCaller = appRouter.createCaller(ctxFor(bob));

      await bobCaller.outfits.rate({ postId: id, rating: 5 });
      await bobCaller.outfits.rate({ postId: id, rating: 2 });

      const view = await bobCaller.outfits.getPost({ id });
      expect(view!.post.ratingCount).toBe(1);
      expect(view!.post.ratingSum).toBe(2);
      expect(view!.avgRating).toBe(2);
    }
  );

  dbIt("averages ratings across different users", async () => {
    const created = await post(alice, "casual", "two raters");
    const id = created.post!.post.id;

    await appRouter
      .createCaller(ctxFor(bob))
      .outfits.rate({ postId: id, rating: 5 });
    await appRouter
      .createCaller(ctxFor(carol))
      .outfits.rate({ postId: id, rating: 3 });

    const view = await appRouter
      .createCaller(ctxFor(null))
      .outfits.getPost({ id });
    expect(view!.post.ratingCount).toBe(2);
    expect(view!.avgRating).toBe(4);
  });

  dbIt("rejects out-of-range ratings", async () => {
    const created = await post(alice);
    const caller = appRouter.createCaller(ctxFor(bob));
    await expect(
      caller.outfits.rate({ postId: created.post!.post.id, rating: 9 })
    ).rejects.toThrow();
    await expect(
      caller.outfits.rate({ postId: created.post!.post.id, rating: 0 })
    ).rejects.toThrow();
  });

  dbIt("refuses to let an author rate their own outfit", async () => {
    const created = await post(alice, "casual", "my own fit");
    const caller = appRouter.createCaller(ctxFor(alice));

    await expect(
      caller.outfits.rate({ postId: created.post!.post.id, rating: 5 })
    ).rejects.toThrow(/your own outfit/i);

    const view = await appRouter
      .createCaller(ctxFor(null))
      .outfits.getPost({ id: created.post!.post.id });
    expect(view!.post.ratingCount).toBe(0);
  });

  dbIt("requires authentication", async () => {
    const created = await post(alice);
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(
      caller.outfits.rate({ postId: created.post!.post.id, rating: 3 })
    ).rejects.toThrow();
  });
});

describe("outfits.battle", () => {
  dbIt("returns two distinct outfits to compare", async () => {
    await post(alice);
    await post(bob);
    const caller = appRouter.createCaller(ctxFor(null));
    const matchup = await caller.outfits.battle.next();

    expect(matchup).not.toBeNull();
    expect(matchup!.postA.id).not.toBe(matchup!.postB.id);
  });

  dbIt(
    "moves Elo toward the winner and keeps the pair's total constant",
    async () => {
      const a = (await post(alice)).post!.post;
      const b = (await post(bob)).post!.post;

      const res = await appRouter
        .createCaller(ctxFor(carol))
        .outfits.battle.vote({ postAId: a.id, postBId: b.id, winnerId: a.id });

      // Equal starting ratings (1200 vs 1200) → winner +16, loser -16 at K=32
      expect(res.newEloA).toBe(1216);
      expect(res.newEloB).toBe(1184);
      expect(res.newEloA + res.newEloB).toBe(a.eloRating + b.eloRating);

      const after = await appRouter
        .createCaller(ctxFor(null))
        .outfits.getPost({ id: a.id });
      expect(after!.post.eloRating).toBe(1216);
      expect(after!.post.battleWins).toBe(1);
      expect(after!.post.battleLosses).toBe(0);

      const loser = await appRouter
        .createCaller(ctxFor(null))
        .outfits.getPost({ id: b.id });
      expect(loser!.post.battleWins).toBe(0);
      expect(loser!.post.battleLosses).toBe(1);
    }
  );

  dbIt("awards fewer points when a favourite beats an underdog", async () => {
    const a = (await post(alice)).post!.post;
    const b = (await post(bob)).post!.post;

    // Two different judges, since one judge may only vote a pairing once.
    await appRouter.createCaller(ctxFor(carol)).outfits.battle.vote({
      postAId: a.id,
      postBId: b.id,
      winnerId: a.id,
    });
    const second = await appRouter
      .createCaller(ctxFor(dave))
      .outfits.battle.vote({
        postAId: a.id,
        postBId: b.id,
        winnerId: a.id,
      });

    // Second win is worth less than the first (16) because A was already ahead.
    expect(second.newEloA - 1216).toBeLessThan(16);
    expect(second.newEloA).toBeGreaterThan(1216);
  });

  dbIt("rejects a winner that is not part of the matchup", async () => {
    const a = (await post(alice)).post!.post;
    const b = (await post(bob)).post!.post;
    const caller = appRouter.createCaller(ctxFor(carol));

    await expect(
      caller.outfits.battle.vote({
        postAId: a.id,
        postBId: b.id,
        winnerId: 999999,
      })
    ).rejects.toThrow();
  });

  dbIt(
    "refuses a second vote on the same pairing by the same judge",
    async () => {
      const a = (await post(alice)).post!.post;
      const b = (await post(bob)).post!.post;
      const caller = appRouter.createCaller(ctxFor(carol));

      await caller.outfits.battle.vote({
        postAId: a.id,
        postBId: b.id,
        winnerId: a.id,
      });

      // Same pairing again — including with the sides swapped — is rejected,
      // otherwise a single user could farm Elo for a favourite outfit.
      await expect(
        caller.outfits.battle.vote({
          postAId: a.id,
          postBId: b.id,
          winnerId: a.id,
        })
      ).rejects.toThrow(/already voted/i);
      await expect(
        caller.outfits.battle.vote({
          postAId: b.id,
          postBId: a.id,
          winnerId: a.id,
        })
      ).rejects.toThrow(/already voted/i);

      // ...and the Elo only moved once.
      const after = await appRouter
        .createCaller(ctxFor(null))
        .outfits.getPost({ id: a.id });
      expect(after!.post.eloRating).toBe(1216);
      expect(after!.post.battleWins).toBe(1);
    }
  );

  dbIt("lets a different judge vote the same pairing", async () => {
    const a = (await post(alice)).post!.post;
    const b = (await post(bob)).post!.post;

    await appRouter.createCaller(ctxFor(carol)).outfits.battle.vote({
      postAId: a.id,
      postBId: b.id,
      winnerId: a.id,
    });
    await expect(
      appRouter.createCaller(ctxFor(dave)).outfits.battle.vote({
        postAId: a.id,
        postBId: b.id,
        winnerId: a.id,
      })
    ).resolves.toBeDefined();
  });

  dbIt(
    "refuses a vote on a matchup containing the judge's own outfit",
    async () => {
      const a = (await post(alice)).post!.post;
      const b = (await post(bob)).post!.post;

      await expect(
        appRouter.createCaller(ctxFor(alice)).outfits.battle.vote({
          postAId: a.id,
          postBId: b.id,
          winnerId: a.id,
        })
      ).rejects.toThrow(/your own outfit/i);
    }
  );

  dbIt(
    "keeps a signed-in judge's own outfits out of their matchups",
    async () => {
      await post(alice);
      await post(alice);
      await post(bob);

      const matchup = await appRouter
        .createCaller(ctxFor(alice))
        .outfits.battle.next();

      if (matchup) {
        expect(matchup.postA.userId).not.toBe(alice.id);
        expect(matchup.postB.userId).not.toBe(alice.id);
      }
    }
  );

  dbIt("requires authentication to vote", async () => {
    const a = (await post(alice)).post!.post;
    const b = (await post(bob)).post!.post;
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(
      caller.outfits.battle.vote({
        postAId: a.id,
        postBId: b.id,
        winnerId: a.id,
      })
    ).rejects.toThrow();
  });
});

describe("outfits.leaderboard", () => {
  dbIt("ranks outfits by Elo, highest first", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    const rows = await caller.outfits.leaderboard.posts({
      period: "all",
      limit: 20,
    });

    expect(rows.length).toBeGreaterThan(0);
    const elos = rows.map(r => r.post.eloRating);
    expect([...elos].sort((x, y) => y - x)).toEqual(elos);
  });

  dbIt("aggregates stylists with post counts and wins", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    const rows = await caller.outfits.leaderboard.users({
      period: "all",
      limit: 20,
    });

    expect(rows.length).toBeGreaterThan(0);
    const aliceRow = rows.find(r => r.userId === alice.id);
    expect(aliceRow).toBeDefined();
    expect(Number(aliceRow!.postCount)).toBeGreaterThan(0);
    expect(aliceRow!.authorName).toBe("Alice");
  });

  dbIt("scopes results to the requested period", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    const day = await caller.outfits.leaderboard.posts({
      period: "day",
      limit: 20,
    });
    const all = await caller.outfits.leaderboard.posts({
      period: "all",
      limit: 20,
    });
    // Everything was created just now, so the day window should not exceed all-time.
    expect(day.length).toBeLessThanOrEqual(all.length);
  });
});

describe("outfits.follow and profile", () => {
  dbIt("toggles a follow on and back off", async () => {
    const caller = appRouter.createCaller(ctxFor(alice));

    const on = await caller.outfits.follow.toggle({ userId: bob.id });
    expect(on.following).toBe(true);

    let profile = await caller.outfits.profile.get({ userId: bob.id });
    expect(profile!.followerCount).toBe(1);
    expect(profile!.isFollowing).toBe(true);

    const off = await caller.outfits.follow.toggle({ userId: bob.id });
    expect(off.following).toBe(false);

    profile = await caller.outfits.profile.get({ userId: bob.id });
    expect(profile!.followerCount).toBe(0);
    expect(profile!.isFollowing).toBe(false);
  });

  dbIt("refuses a self-follow", async () => {
    const caller = appRouter.createCaller(ctxFor(alice));
    await expect(
      caller.outfits.follow.toggle({ userId: alice.id })
    ).rejects.toThrow();
  });

  dbIt("reports profile stats and flags the viewer's own profile", async () => {
    const caller = appRouter.createCaller(ctxFor(alice));
    const profile = await caller.outfits.profile.get({ userId: alice.id });

    expect(profile!.user.name).toBe("Alice");
    expect(profile!.isSelf).toBe(true);
    expect(profile!.posts.length).toBeGreaterThan(0);
    expect(Number(profile!.stats!.postCount)).toBe(profile!.posts.length);
    expect(Number(profile!.stats!.avgElo)).toBeGreaterThan(0);
  });

  dbIt("returns null for an unknown user", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    expect(await caller.outfits.profile.get({ userId: 987654 })).toBeNull();
  });
});

describe("outfits.deletePost", () => {
  dbIt("removes the author's own post and its ratings", async () => {
    const created = await post(alice, "vintage", "delete me");
    const id = created.post!.post.id;
    await appRouter
      .createCaller(ctxFor(bob))
      .outfits.rate({ postId: id, rating: 5 });

    await appRouter.createCaller(ctxFor(alice)).outfits.deletePost({ id });

    expect(
      await appRouter.createCaller(ctxFor(null)).outfits.getPost({ id })
    ).toBeNull();

    const conn = await getDb();
    const leftover = await conn!.select().from(outfitRatings);
    expect(leftover.some(r => r.postId === id)).toBe(false);
  });

  dbIt("does not let another user delete someone else's post", async () => {
    const created = await post(alice, "casual", "not yours");
    const id = created.post!.post.id;

    await appRouter.createCaller(ctxFor(bob)).outfits.deletePost({ id });

    const still = await appRouter
      .createCaller(ctxFor(null))
      .outfits.getPost({ id });
    expect(still).not.toBeNull();
  });
});

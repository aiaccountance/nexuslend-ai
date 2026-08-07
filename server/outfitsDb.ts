import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  outfitPosts,
  InsertOutfitPost,
  outfitRatings,
  outfitMatchups,
  outfitFollows,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

const K_FACTOR = 32;

export type OutfitCategory =
  | "casual"
  | "streetwear"
  | "formal"
  | "athletic"
  | "vintage"
  | "other";

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// ─── Posts ────────────────────────────────────────────────────────────────────
export async function createOutfitPost(post: InsertOutfitPost) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(outfitPosts).values(post);
  return result;
}

export async function getOutfitPostById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({
      post: outfitPosts,
      authorName: users.name,
      authorOpenId: users.openId,
    })
    .from(outfitPosts)
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .where(eq(outfitPosts.id, id))
    .limit(1);
  return rows[0];
}

export type OutfitFeedSort = "new" | "top" | "trending";

export async function listOutfitFeed(opts: {
  sort: OutfitFeedSort;
  limit: number;
  offset: number;
  category?: OutfitCategory;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const { sort, limit, offset, category, userId } = opts;

  const conditions = [];
  if (category) conditions.push(eq(outfitPosts.category, category));
  if (userId) conditions.push(eq(outfitPosts.userId, userId));

  const orderBy =
    sort === "top"
      ? desc(
          sql`(${outfitPosts.ratingSum} / NULLIF(${outfitPosts.ratingCount}, 0))`
        )
      : sort === "trending"
        ? desc(outfitPosts.eloRating)
        : desc(outfitPosts.createdAt);

  const query = db
    .select({
      post: outfitPosts,
      authorName: users.name,
      authorOpenId: users.openId,
    })
    .from(outfitPosts)
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function deleteOutfitPost(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(outfitRatings).where(eq(outfitRatings.postId, id));
  await db
    .delete(outfitPosts)
    .where(and(eq(outfitPosts.id, id), eq(outfitPosts.userId, userId)));
}

// ─── Ratings ──────────────────────────────────────────────────────────────────
export async function rateOutfitPost(
  postId: number,
  userId: number,
  rating: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select()
    .from(outfitRatings)
    .where(
      and(eq(outfitRatings.postId, postId), eq(outfitRatings.userId, userId))
    )
    .limit(1);

  if (existing[0]) {
    const delta = rating - existing[0].rating;
    await db
      .update(outfitRatings)
      .set({ rating })
      .where(eq(outfitRatings.id, existing[0].id));
    await db
      .update(outfitPosts)
      .set({ ratingSum: sql`${outfitPosts.ratingSum} + ${delta}` })
      .where(eq(outfitPosts.id, postId));
  } else {
    await db.insert(outfitRatings).values({ postId, userId, rating });
    await db
      .update(outfitPosts)
      .set({
        ratingSum: sql`${outfitPosts.ratingSum} + ${rating}`,
        ratingCount: sql`${outfitPosts.ratingCount} + 1`,
      })
      .where(eq(outfitPosts.id, postId));
  }
}

export async function getUserRatingForPost(postId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(outfitRatings)
    .where(
      and(eq(outfitRatings.postId, postId), eq(outfitRatings.userId, userId))
    )
    .limit(1);
  return rows[0];
}

// ─── Battles / Elo ────────────────────────────────────────────────────────────
export async function getRandomMatchupPair(excludePostId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = excludePostId
    ? [sql`${outfitPosts.id} != ${excludePostId}`]
    : [];
  const query = db
    .select()
    .from(outfitPosts)
    .orderBy(sql`RAND()`)
    .limit(2);
  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function recordBattleVote(
  postAId: number,
  postBId: number,
  winnerId: number,
  voterUserId: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (winnerId !== postAId && winnerId !== postBId) {
    throw new Error("winnerId must be one of the two posts in the matchup");
  }

  const rows = await db
    .select()
    .from(outfitPosts)
    .where(inArray(outfitPosts.id, [postAId, postBId]));

  const postA = rows.find(r => r.id === postAId);
  const postB = rows.find(r => r.id === postBId);
  if (!postA || !postB) throw new Error("One or both posts not found");

  const expectedA = expectedScore(postA.eloRating, postB.eloRating);
  const expectedB = 1 - expectedA;
  const scoreA = winnerId === postAId ? 1 : 0;
  const scoreB = 1 - scoreA;

  const newEloA = Math.round(postA.eloRating + K_FACTOR * (scoreA - expectedA));
  const newEloB = Math.round(postB.eloRating + K_FACTOR * (scoreB - expectedB));

  await db
    .update(outfitPosts)
    .set({
      eloRating: newEloA,
      battleWins: sql`${outfitPosts.battleWins} + ${scoreA}`,
      battleLosses: sql`${outfitPosts.battleLosses} + ${1 - scoreA}`,
    })
    .where(eq(outfitPosts.id, postAId));

  await db
    .update(outfitPosts)
    .set({
      eloRating: newEloB,
      battleWins: sql`${outfitPosts.battleWins} + ${scoreB}`,
      battleLosses: sql`${outfitPosts.battleLosses} + ${1 - scoreB}`,
    })
    .where(eq(outfitPosts.id, postBId));

  await db
    .insert(outfitMatchups)
    .values({ postAId, postBId, winnerId, voterUserId });

  return { newEloA, newEloB };
}

// ─── Leaderboards ─────────────────────────────────────────────────────────────
export type LeaderboardPeriod = "day" | "week" | "all";

function periodCutoff(period: LeaderboardPeriod): Date | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "day") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export async function leaderboardPosts(
  period: LeaderboardPeriod,
  limit: number
) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = periodCutoff(period);
  const query = db
    .select({
      post: outfitPosts,
      authorName: users.name,
      authorOpenId: users.openId,
    })
    .from(outfitPosts)
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .orderBy(desc(outfitPosts.eloRating))
    .limit(limit);
  if (cutoff) {
    return query.where(sql`${outfitPosts.createdAt} >= ${cutoff}`);
  }
  return query;
}

export async function leaderboardUsers(
  period: LeaderboardPeriod,
  limit: number
) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = periodCutoff(period);
  const base = db
    .select({
      userId: outfitPosts.userId,
      authorName: users.name,
      authorOpenId: users.openId,
      postCount: sql<number>`COUNT(${outfitPosts.id})`,
      totalWins: sql<number>`COALESCE(SUM(${outfitPosts.battleWins}), 0)`,
      avgElo: sql<number>`AVG(${outfitPosts.eloRating})`,
    })
    .from(outfitPosts)
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .groupBy(outfitPosts.userId, users.name, users.openId)
    .orderBy(desc(sql`AVG(${outfitPosts.eloRating})`))
    .limit(limit);

  if (cutoff) {
    return base.where(sql`${outfitPosts.createdAt} >= ${cutoff}`);
  }
  return base;
}

// ─── Profiles ─────────────────────────────────────────────────────────────────
export async function getUserProfileStats(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({
      postCount: sql<number>`COUNT(${outfitPosts.id})`,
      ratingSumTotal: sql<number>`COALESCE(SUM(${outfitPosts.ratingSum}), 0)`,
      ratingCountTotal: sql<number>`COALESCE(SUM(${outfitPosts.ratingCount}), 0)`,
      totalWins: sql<number>`COALESCE(SUM(${outfitPosts.battleWins}), 0)`,
      totalLosses: sql<number>`COALESCE(SUM(${outfitPosts.battleLosses}), 0)`,
      avgElo: sql<number>`COALESCE(AVG(${outfitPosts.eloRating}), 1200)`,
    })
    .from(outfitPosts)
    .where(eq(outfitPosts.userId, userId));
  return rows[0];
}

export async function getFollowerCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(outfitFollows)
    .where(eq(outfitFollows.followingId, userId));
  return rows[0]?.count ?? 0;
}

export async function getFollowingCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(outfitFollows)
    .where(eq(outfitFollows.followerId, userId));
  return rows[0]?.count ?? 0;
}

export async function isFollowing(followerId: number, followingId: number) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(outfitFollows)
    .where(
      and(
        eq(outfitFollows.followerId, followerId),
        eq(outfitFollows.followingId, followingId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function toggleFollow(followerId: number, followingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (followerId === followingId) throw new Error("Cannot follow yourself");

  const existing = await db
    .select()
    .from(outfitFollows)
    .where(
      and(
        eq(outfitFollows.followerId, followerId),
        eq(outfitFollows.followingId, followingId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db.delete(outfitFollows).where(eq(outfitFollows.id, existing[0].id));
    return { following: false };
  }
  await db.insert(outfitFollows).values({ followerId, followingId });
  return { following: true };
}

export async function getUserByIdPublic(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0];
}

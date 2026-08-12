import { eq, ne, and, desc, sql, inArray } from "drizzle-orm";
import {
  outfitAccounts,
  outfitPosts,
  InsertOutfitPost,
  outfitRatings,
  outfitMatchups,
  outfitFollows,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";

const K_FACTOR = 32;

/**
 * A rule the user broke (rating their own outfit, double-voting a matchup)
 * rather than a server fault — the router maps these to 4xx tRPC codes.
 */
export class OutfitRuleError extends Error {
  constructor(
    message: string,
    readonly code: "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST" | "NOT_FOUND"
  ) {
    super(message);
    this.name = "OutfitRuleError";
  }
}

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
      authorUsername: outfitAccounts.username,
      authorDisplayUsername: outfitAccounts.displayUsername,
      authorAvatarUrl: outfitAccounts.avatarUrl,
    })
    .from(outfitPosts)
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .leftJoin(outfitAccounts, eq(outfitAccounts.userId, outfitPosts.userId))
    .where(eq(outfitPosts.id, id))
    .limit(1);
  return rows[0];
}

export type OutfitFeedSort = "new" | "top" | "trending";

/**
 * Where the last page stopped.
 *
 * `value` is whatever the feed is sorted by — a date, a rating, a score — and
 * `id` breaks ties between posts that share it. Together they name an exact
 * position in the order, which is what lets the next page start from there.
 */
export type FeedCursor = { value: string; id: number };

/**
 * A page of the feed.
 *
 * Paging by cursor rather than by "skip the first N": skipping means the
 * database walks and throws away everything before the page, so page fifty
 * costs fifty times page one. Naming the last post seen costs the same on
 * every page, however deep.
 */
export async function listOutfitFeed(opts: {
  sort: OutfitFeedSort;
  limit: number;
  offset?: number;
  cursor?: FeedCursor;
  category?: OutfitCategory;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const { sort, limit, offset = 0, cursor, category, userId } = opts;

  const sortColumn =
    sort === "top"
      ? outfitPosts.ratingAvg
      : sort === "trending"
        ? outfitPosts.eloRating
        : outfitPosts.createdAt;

  const conditions = [];
  if (category) conditions.push(eq(outfitPosts.category, category));
  if (userId) conditions.push(eq(outfitPosts.userId, userId));
  if (cursor) {
    // Everything strictly after the last post seen, in this order.
    conditions.push(
      sql`(${sortColumn} < ${cursor.value} OR (${sortColumn} = ${cursor.value} AND ${outfitPosts.id} < ${cursor.id}))`
    );
  }

  const query = db
    .select({
      post: outfitPosts,
      authorName: users.name,
      authorUsername: outfitAccounts.username,
      authorDisplayUsername: outfitAccounts.displayUsername,
      authorAvatarUrl: outfitAccounts.avatarUrl,
    })
    .from(outfitPosts)
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .leftJoin(outfitAccounts, eq(outfitAccounts.userId, outfitPosts.userId))
    .orderBy(desc(sortColumn), desc(outfitPosts.id))
    .limit(limit)
    .offset(cursor ? 0 : offset);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

/** The cursor that would fetch the page after this one. */
export function cursorAfter(
  sort: OutfitFeedSort,
  post: {
    id: number;
    createdAt: Date;
    eloRating: number;
    ratingAvg: string | null;
  }
): FeedCursor {
  const value =
    sort === "top"
      ? (post.ratingAvg ?? "0")
      : sort === "trending"
        ? String(post.eloRating)
        : toSqlTime(post.createdAt);
  return { value, id: post.id };
}

/** A date in the form the database compares against a DATETIME column. */
function toSqlTime(at: Date): string {
  return new Date(at).toISOString().slice(0, 19).replace("T", " ");
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

  const [target] = await db
    .select({ userId: outfitPosts.userId })
    .from(outfitPosts)
    .where(eq(outfitPosts.id, postId))
    .limit(1);
  if (!target) throw new OutfitRuleError("Outfit not found", "NOT_FOUND");
  if (target.userId === userId) {
    throw new OutfitRuleError("You cannot rate your own outfit", "FORBIDDEN");
  }

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
/**
 * Voters never judge their own outfits, so exclude them from the draw rather
 * than serving a matchup the vote endpoint would then reject.
 */
/**
 * Two outfits to put against each other.
 *
 * Not `ORDER BY RAND()` — that shuffles every post ever made to pick two, and
 * at twenty thousand posts it was the slowest thing in the app by a distance.
 * This jumps to a random point in the table by id and takes what it finds
 * from there. Ids left behind by deleted posts make the draw very slightly
 * uneven, which matters not at all for choosing a pair to look at.
 */
export async function getRandomMatchupPair(excludeUserId?: number) {
  const db = await getDb();
  if (!db) return [];

  const [bounds] = await db
    .select({
      lowest: sql<number>`MIN(${outfitPosts.id})`,
      highest: sql<number>`MAX(${outfitPosts.id})`,
    })
    .from(outfitPosts);
  if (!bounds?.highest) return [];

  const low = Number(bounds.lowest);
  const high = Number(bounds.highest);
  const notMine =
    excludeUserId === undefined
      ? undefined
      : ne(outfitPosts.userId, excludeUserId);

  const pickFrom = async (fromId: number) => {
    const where = notMine
      ? and(sql`${outfitPosts.id} >= ${fromId}`, notMine)
      : sql`${outfitPosts.id} >= ${fromId}`;
    const rows = await db
      .select()
      .from(outfitPosts)
      .where(where)
      .orderBy(outfitPosts.id)
      .limit(1);
    if (rows[0]) return rows[0];
    // Past the end — wrap round to the beginning.
    const wrapped = await db
      .select()
      .from(outfitPosts)
      .where(notMine ?? sql`1 = 1`)
      .orderBy(outfitPosts.id)
      .limit(1);
    return wrapped[0];
  };

  const somewhere = () => low + Math.floor(Math.random() * (high - low + 1));
  const first = await pickFrom(somewhere());
  if (!first) return [];

  // Try a few times rather than loop forever on a table with one usable post.
  for (let attempt = 0; attempt < 5; attempt++) {
    const second = await pickFrom(somewhere());
    if (second && second.id !== first.id) return [first, second];
  }
  return [first];
}

/** Unordered pair key, so (A,B) and (B,A) count as the same matchup. */
function matchupKey(postAId: number, postBId: number) {
  const [low, high] =
    postAId < postBId ? [postAId, postBId] : [postBId, postAId];
  return { low, high };
}

export async function hasVotedOnMatchup(
  postAId: number,
  postBId: number,
  voterUserId: number
) {
  const db = await getDb();
  if (!db) return false;
  const { low, high } = matchupKey(postAId, postBId);
  const rows = await db
    .select({ id: outfitMatchups.id })
    .from(outfitMatchups)
    .where(
      and(
        eq(outfitMatchups.voterUserId, voterUserId),
        sql`LEAST(${outfitMatchups.postAId}, ${outfitMatchups.postBId}) = ${low}`,
        sql`GREATEST(${outfitMatchups.postAId}, ${outfitMatchups.postBId}) = ${high}`
      )
    )
    .limit(1);
  return rows.length > 0;
}

export async function recordBattleVote(
  postAId: number,
  postBId: number,
  winnerId: number,
  voterUserId: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (postAId === postBId) {
    throw new OutfitRuleError(
      "A matchup needs two different outfits",
      "BAD_REQUEST"
    );
  }
  if (winnerId !== postAId && winnerId !== postBId) {
    throw new OutfitRuleError(
      "winnerId must be one of the two posts in the matchup",
      "BAD_REQUEST"
    );
  }

  const rows = await db
    .select()
    .from(outfitPosts)
    .where(inArray(outfitPosts.id, [postAId, postBId]));

  const postA = rows.find(r => r.id === postAId);
  const postB = rows.find(r => r.id === postBId);
  if (!postA || !postB)
    throw new OutfitRuleError("One or both posts not found", "NOT_FOUND");

  if (voterUserId !== null) {
    // Judging your own outfit is a conflict of interest.
    if (postA.userId === voterUserId || postB.userId === voterUserId) {
      throw new OutfitRuleError(
        "You cannot vote on a matchup with your own outfit",
        "FORBIDDEN"
      );
    }
    // One vote per person per pairing, otherwise Elo can be farmed by
    // repeatedly voting the same matchup.
    if (await hasVotedOnMatchup(postAId, postBId, voterUserId)) {
      throw new OutfitRuleError(
        "You have already voted on this matchup",
        "CONFLICT"
      );
    }
  }

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

const DAY = 24 * 60 * 60 * 1000;

/**
 * How far back each board looks.
 *
 * "all" is a 90-day season rather than the whole history, for two reasons. It
 * keeps the board readable — a table that only ever grows would eventually be
 * topped by people who stopped posting years ago — and it keeps it fast: an
 * unbounded board has to read and group every post ever made, which is the one
 * query here that gets slower forever.
 */
const SEASON_DAYS = 90;

/**
 * How many posts someone needs before they can appear on the stylist board.
 * Ranking by average rating alone means one lucky post beats a whole year of
 * consistently good ones.
 */
const MIN_POSTS_FOR_STYLIST_BOARD = 3;

function periodCutoff(period: LeaderboardPeriod): Date {
  const now = Date.now();
  if (period === "day") return new Date(now - DAY);
  if (period === "week") return new Date(now - 7 * DAY);
  return new Date(now - SEASON_DAYS * DAY);
}

/**
 * The single best-performing outfit of the last 7 days. Requires at least one
 * battle win so a brand-new post can't take the crown at its default Elo.
 */
export async function outfitOfTheWeek() {
  const db = await getDb();
  if (!db) return undefined;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      post: outfitPosts,
      authorName: users.name,
      authorUsername: outfitAccounts.username,
      authorDisplayUsername: outfitAccounts.displayUsername,
      authorAvatarUrl: outfitAccounts.avatarUrl,
    })
    .from(outfitPosts)
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .leftJoin(outfitAccounts, eq(outfitAccounts.userId, outfitPosts.userId))
    .where(
      and(
        sql`${outfitPosts.createdAt} >= ${cutoff}`,
        sql`${outfitPosts.battleWins} > 0`
      )
    )
    .orderBy(desc(outfitPosts.eloRating))
    .limit(1);
  return rows[0];
}

export async function leaderboardPosts(
  period: LeaderboardPeriod,
  limit: number
) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = periodCutoff(period);
  return db
    .select({
      post: outfitPosts,
      authorName: users.name,
      authorUsername: outfitAccounts.username,
      authorDisplayUsername: outfitAccounts.displayUsername,
      authorAvatarUrl: outfitAccounts.avatarUrl,
    })
    .from(outfitPosts)
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .leftJoin(outfitAccounts, eq(outfitAccounts.userId, outfitPosts.userId))
    .where(sql`${outfitPosts.createdAt} >= ${cutoff}`)
    .orderBy(desc(outfitPosts.eloRating))
    .limit(limit);
}

export async function leaderboardUsers(
  period: LeaderboardPeriod,
  limit: number
) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = periodCutoff(period);

  // Two steps on purpose. Grouping by the person and their name and their
  // handle and their avatar all at once builds a temporary table as wide as
  // the profile; grouping by the person alone builds one as wide as a number,
  // and the twenty names are then looked up by primary key. Same answer, and
  // it stopped being the slowest query here.
  const standings = await db
    .select({
      userId: outfitPosts.userId,
      postCount: sql<number>`COUNT(${outfitPosts.id})`,
      totalWins: sql<number>`COALESCE(SUM(${outfitPosts.battleWins}), 0)`,
      avgElo: sql<number>`AVG(${outfitPosts.eloRating})`,
    })
    .from(outfitPosts)
    .where(sql`${outfitPosts.createdAt} >= ${cutoff}`)
    .groupBy(outfitPosts.userId)
    .having(sql`COUNT(${outfitPosts.id}) >= ${MIN_POSTS_FOR_STYLIST_BOARD}`)
    .orderBy(desc(sql`AVG(${outfitPosts.eloRating})`))
    .limit(limit);

  if (standings.length === 0) return [];

  const ids = standings.map(row => row.userId);
  const people = await db
    .select({
      userId: users.id,
      authorName: users.name,
      authorUsername: outfitAccounts.username,
      authorDisplayUsername: outfitAccounts.displayUsername,
      authorAvatarUrl: outfitAccounts.avatarUrl,
    })
    .from(users)
    .leftJoin(outfitAccounts, eq(outfitAccounts.userId, users.id))
    .where(inArray(users.id, ids));

  const byId = new Map(people.map(person => [person.userId, person]));
  return standings.map(row => ({
    userId: row.userId,
    postCount: row.postCount,
    totalWins: row.totalWins,
    avgElo: row.avgElo,
    authorName: byId.get(row.userId)?.authorName ?? null,
    authorUsername: byId.get(row.userId)?.authorUsername ?? null,
    authorDisplayUsername:
      byId.get(row.userId)?.authorDisplayUsername ?? null,
    authorAvatarUrl: byId.get(row.userId)?.authorAvatarUrl ?? null,
  }));
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
  if (followerId === followingId)
    throw new OutfitRuleError("You cannot follow yourself", "FORBIDDEN");

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

/**
 * Search and discovery.
 *
 * Three things people look for: a person, a kind of outfit ("all black",
 * "linen"), and a category. One query box covers all three and the results
 * come back grouped, so typing a handle finds the person and typing a colour
 * finds the outfits.
 *
 * The outfit search reads the tags the stylist wrote plus the caption the
 * person wrote. It's a scan of the posts table — fine at the size this is,
 * and the place to change first if search ever feels slow. A real full-text
 * index is the fix, and the note in `searchPosts` says so.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { outfitAccounts, outfitPosts, users } from "../drizzle/schema";

const MAX_RESULTS = 24;

/** Nothing shorter is worth running — it would match half the table. */
export const MIN_QUERY_LENGTH = 2;

export type OutfitCategory =
  | "casual"
  | "streetwear"
  | "formal"
  | "athletic"
  | "vintage"
  | "other";

/**
 * Outfits whose tags, caption or category mention the query.
 *
 * Note for later: this is a LIKE over every post. It stays quick into the tens
 * of thousands and then it won't — at that point the tags want their own table
 * with an index, or a full-text index on caption.
 */
export async function searchPosts(query: string, limit = MAX_RESULTS) {
  const db = await getDb();
  if (!db) return [];
  const needle = `%${query.toLowerCase()}%`;

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
    .where(
      sql`(
        LOWER(CAST(${outfitPosts.aiTags} AS CHAR)) LIKE ${needle}
        OR LOWER(${outfitPosts.caption}) LIKE ${needle}
        OR LOWER(${outfitPosts.aiOccasion}) LIKE ${needle}
        OR LOWER(${outfitPosts.category}) LIKE ${needle}
      )`
    )
    .orderBy(desc(outfitPosts.eloRating))
    .limit(limit);
}

/** Everything in one category, best first. */
export async function postsByCategory(
  category: OutfitCategory,
  limit = MAX_RESULTS
) {
  const db = await getDb();
  if (!db) return [];
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
    .where(eq(outfitPosts.category, category))
    .orderBy(desc(outfitPosts.eloRating))
    .limit(limit);
}

/**
 * The tags showing up most often across recent outfits, for the row of
 * suggestions above an empty search box. Reads the last few hundred posts
 * rather than all of them — this is a "what's around at the moment" list, not
 * a statistic.
 */
export async function trendingTags(limit = 12): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ tags: outfitPosts.aiTags })
    .from(outfitPosts)
    .orderBy(desc(outfitPosts.createdAt))
    .limit(400);

  const counts = new Map<string, number>();
  for (const row of rows) {
    const tags = asTags(row.tags);
    for (const raw of tags) {
      if (typeof raw !== "string") continue;
      const tag = raw.trim().toLowerCase();
      if (tag.length < MIN_QUERY_LENGTH || tag.length > 30) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

/**
 * The tag list off a post.
 *
 * A JSON column comes back already parsed on some drivers and as a string on
 * others, depending on how the connection was made — so handle both rather
 * than depending on which one is in front of us today.
 */
function asTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter(v => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * What people actually wear.
 *
 * The wardrobe knows what someone owns. This is what turns that list into a
 * record — one row each time a garment is worn — and it is the only thing here
 * that gets more useful the longer someone stays.
 *
 * Two questions it exists to answer. "What haven't I worn since March?", which
 * is what makes a nudge to sell something feel helpful rather than pushy. And
 * "what do I wear constantly?", which is what stops the stylist recommending
 * the same three things forever.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { wardrobeItems, wardrobeOutfits, wardrobeWears } from "../drizzle/schema";

/** Not worn in this long and it's fair to ask whether they still want it. */
export const NEGLECTED_AFTER_DAYS = 120;

/** A date as the database stores it — days, not minutes. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records that some garments were worn on a day.
 *
 * Tapping twice does not count twice: one row per garment per day, enforced by
 * the database rather than by remembering to check.
 */
export async function recordWear(opts: {
  userId: number;
  itemIds: number[];
  outfitId?: number;
  wornOn?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { userId, itemIds, outfitId } = opts;
  if (itemIds.length === 0) return { recorded: 0 };

  // Only their own garments, so a guessed id can't write into someone's diary.
  const owned = await db
    .select({ id: wardrobeItems.id })
    .from(wardrobeItems)
    .where(
      and(eq(wardrobeItems.userId, userId), inArray(wardrobeItems.id, itemIds))
    );
  if (owned.length === 0) return { recorded: 0 };

  const wornOn = opts.wornOn ?? today();
  await db
    .insert(wardrobeWears)
    .values(owned.map(item => ({ userId, itemId: item.id, outfitId, wornOn })))
    .onDuplicateKeyUpdate({ set: { outfitId: outfitId ?? null } });

  return { recorded: owned.length, wornOn };
}

/** Undoes today's entry, for the tap that was a mistake. */
export async function forgetWear(
  userId: number,
  itemIds: number[],
  wornOn?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (itemIds.length === 0) return { removed: 0 };
  await db
    .delete(wardrobeWears)
    .where(
      and(
        eq(wardrobeWears.userId, userId),
        inArray(wardrobeWears.itemId, itemIds),
        eq(wardrobeWears.wornOn, wornOn ?? today())
      )
    );
  return { removed: itemIds.length };
}

/**
 * How often and how recently each garment has been worn.
 *
 * Returned as a map keyed by item, so the closet can show it against every
 * garment in one pass rather than asking once per item.
 */
export async function wearSummary(userId: number) {
  const db = await getDb();
  if (!db) return new Map<number, { times: number; lastWorn: string | null }>();

  const rows = await db
    .select({
      itemId: wardrobeWears.itemId,
      times: sql<number>`COUNT(*)`,
      lastWorn: sql<string>`MAX(${wardrobeWears.wornOn})`,
    })
    .from(wardrobeWears)
    .where(eq(wardrobeWears.userId, userId))
    .groupBy(wardrobeWears.itemId);

  return new Map(
    rows.map(row => [
      row.itemId,
      { times: Number(row.times), lastWorn: row.lastWorn ?? null },
    ])
  );
}

/**
 * Garments they own but never wear.
 *
 * Never-worn ones come first, then longest-neglected — which is the order
 * someone would want to deal with them in.
 */
export async function neglected(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      item: wardrobeItems,
      lastWorn: sql<string | null>`MAX(${wardrobeWears.wornOn})`,
      times: sql<number>`COUNT(${wardrobeWears.id})`,
    })
    .from(wardrobeItems)
    .leftJoin(
      wardrobeWears,
      and(
        eq(wardrobeWears.itemId, wardrobeItems.id),
        eq(wardrobeWears.userId, userId)
      )
    )
    .where(eq(wardrobeItems.userId, userId))
    .groupBy(wardrobeItems.id)
    .having(
      sql`MAX(${wardrobeWears.wornOn}) IS NULL
          OR MAX(${wardrobeWears.wornOn}) < DATE_SUB(CURDATE(), INTERVAL ${NEGLECTED_AFTER_DAYS} DAY)`
    )
    // Never worn first, then whatever has gone longest.
    .orderBy(sql`MAX(${wardrobeWears.wornOn}) IS NOT NULL`, sql`MAX(${wardrobeWears.wornOn})`)
    .limit(limit);

  return rows.map(row => ({
    item: row.item,
    lastWorn: row.lastWorn,
    times: Number(row.times),
    daysSince: row.lastWorn ? daysSince(row.lastWorn) : null,
  }));
}

/** The garments earning their keep, most-worn first. */
export async function favourites(userId: number, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      item: wardrobeItems,
      times: sql<number>`COUNT(${wardrobeWears.id})`,
      lastWorn: sql<string>`MAX(${wardrobeWears.wornOn})`,
    })
    .from(wardrobeWears)
    .innerJoin(wardrobeItems, eq(wardrobeItems.id, wardrobeWears.itemId))
    .where(eq(wardrobeWears.userId, userId))
    .groupBy(wardrobeItems.id)
    .orderBy(desc(sql`COUNT(${wardrobeWears.id})`))
    .limit(limit);

  return rows.map(row => ({
    item: row.item,
    times: Number(row.times),
    lastWorn: row.lastWorn,
  }));
}

/** What they wore, day by day, most recent first. */
export async function diary(userId: number, limit = 60) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      wornOn: wardrobeWears.wornOn,
      itemId: wardrobeWears.itemId,
      itemName: wardrobeItems.name,
      imageUrl: wardrobeItems.imageUrl,
      outfitId: wardrobeWears.outfitId,
      outfitName: wardrobeOutfits.name,
    })
    .from(wardrobeWears)
    .innerJoin(wardrobeItems, eq(wardrobeItems.id, wardrobeWears.itemId))
    .leftJoin(
      wardrobeOutfits,
      eq(wardrobeOutfits.id, wardrobeWears.outfitId)
    )
    .where(eq(wardrobeWears.userId, userId))
    .orderBy(desc(wardrobeWears.wornOn))
    .limit(limit);

  // Grouped by day, because that is how anyone reads it back.
  const days = new Map<
    string,
    {
      wornOn: string;
      outfitName: string | null;
      items: { id: number; name: string; imageUrl: string }[];
    }
  >();
  for (const row of rows) {
    const day = days.get(row.wornOn) ?? {
      wornOn: row.wornOn,
      outfitName: row.outfitName ?? null,
      items: [],
    };
    day.items.push({
      id: row.itemId,
      name: row.itemName,
      imageUrl: row.imageUrl,
    });
    if (row.outfitName) day.outfitName = row.outfitName;
    days.set(row.wornOn, day);
  }
  return Array.from(days.values());
}

function daysSince(day: string): number {
  const then = new Date(`${day}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

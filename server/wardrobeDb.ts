import { eq, and, desc, inArray } from "drizzle-orm";
import {
  wardrobeItems,
  wardrobeOutfits,
  InsertWardrobeItem,
  InsertWardrobeOutfit,
  outfitComments,
  InsertOutfitComment,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { OutfitRuleError } from "./outfitsDb";

export type WardrobeSlot =
  | "top"
  | "bottom"
  | "outerwear"
  | "shoes"
  | "accessory"
  | "dress";

export const WARDROBE_SLOTS: WardrobeSlot[] = [
  "top",
  "bottom",
  "outerwear",
  "shoes",
  "accessory",
  "dress",
];

// ─── Wardrobe items ───────────────────────────────────────────────────────────
export async function createWardrobeItem(item: InsertWardrobeItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(wardrobeItems).values(item);
  return result;
}

export async function getWardrobeItem(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(wardrobeItems)
    .where(eq(wardrobeItems.id, id))
    .limit(1);
  return rows[0];
}

export async function listWardrobeItems(userId: number, slot?: WardrobeSlot) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(wardrobeItems.userId, userId)];
  if (slot) conditions.push(eq(wardrobeItems.slot, slot));
  return db
    .select()
    .from(wardrobeItems)
    .where(and(...conditions))
    .orderBy(desc(wardrobeItems.createdAt));
}

export async function getWardrobeItemsByIds(userId: number, ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db
    .select()
    .from(wardrobeItems)
    .where(
      and(eq(wardrobeItems.userId, userId), inArray(wardrobeItems.id, ids))
    );
}

export async function deleteWardrobeItem(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(wardrobeItems)
    .where(and(eq(wardrobeItems.id, id), eq(wardrobeItems.userId, userId)));
}

// ─── Composed outfits ─────────────────────────────────────────────────────────
export async function createWardrobeOutfit(outfit: InsertWardrobeOutfit) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(wardrobeOutfits).values(outfit);
  return result;
}

export async function getWardrobeOutfit(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(wardrobeOutfits)
    .where(eq(wardrobeOutfits.id, id))
    .limit(1);
  return rows[0];
}

export async function listWardrobeOutfits(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(wardrobeOutfits)
    .where(eq(wardrobeOutfits.userId, userId))
    .orderBy(desc(wardrobeOutfits.createdAt));
}

export async function deleteWardrobeOutfit(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(wardrobeOutfits)
    .where(and(eq(wardrobeOutfits.id, id), eq(wardrobeOutfits.userId, userId)));
}

export async function markOutfitPosted(
  outfitId: number,
  userId: number,
  postId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(wardrobeOutfits)
    .set({ postedPostId: postId })
    .where(
      and(eq(wardrobeOutfits.id, outfitId), eq(wardrobeOutfits.userId, userId))
    );
}

/** Loads an outfit the caller owns, or throws a user-facing rule error. */
export async function requireOwnedOutfit(id: number, userId: number) {
  const outfit = await getWardrobeOutfit(id);
  if (!outfit) throw new OutfitRuleError("Outfit not found", "NOT_FOUND");
  if (outfit.userId !== userId) {
    throw new OutfitRuleError("That outfit is not yours", "FORBIDDEN");
  }
  return outfit;
}

// ─── Comments ─────────────────────────────────────────────────────────────────
export async function addComment(comment: InsertOutfitComment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(outfitComments).values(comment);
  return result;
}

export async function listComments(postId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      comment: outfitComments,
      authorName: users.name,
    })
    .from(outfitComments)
    .leftJoin(users, eq(users.id, outfitComments.userId))
    .where(eq(outfitComments.postId, postId))
    .orderBy(desc(outfitComments.createdAt));
}

export async function deleteComment(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(outfitComments)
    .where(and(eq(outfitComments.id, id), eq(outfitComments.userId, userId)));
}

export async function countComments(postIds: number[]) {
  const db = await getDb();
  if (!db || postIds.length === 0) return new Map<number, number>();
  const rows = await db
    .select({ postId: outfitComments.postId })
    .from(outfitComments)
    .where(inArray(outfitComments.postId, postIds));
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.postId, (counts.get(row.postId) ?? 0) + 1);
  }
  return counts;
}

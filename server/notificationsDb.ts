/**
 * Notifications.
 *
 * The rule this file follows: a notification is never allowed to break the
 * thing that caused it. If writing one fails, the rating, comment or follow
 * that triggered it still stands — so every write here is wrapped, and
 * failures are logged rather than thrown.
 *
 * Text is written at the moment it happens and stored, rather than being
 * rebuilt from the post later. A notification that says "@sam rated your
 * outfit" still reads correctly a month later, after the post is gone.
 */
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  outfitAccounts,
  outfitNotifications,
  type InsertOutfitNotification,
} from "../drizzle/schema";

/** Nobody needs to scroll past this many. */
const INBOX_LIMIT = 60;

/**
 * Records a notification. Never throws: a failure here must not take down the
 * action that caused it.
 */
export async function notify(row: InsertOutfitNotification) {
  // Telling someone about their own actions is noise.
  if (row.actorId && row.actorId === row.userId) return;
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(outfitNotifications).values(row);
  } catch (error) {
    console.error("[notifications] could not record", row.kind, error);
  }
}

/** How someone is referred to in notification text. */
export async function handleFor(userId: number): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return "Someone";
    const rows = await db
      .select({ handle: outfitAccounts.displayUsername })
      .from(outfitAccounts)
      .where(eq(outfitAccounts.userId, userId))
      .limit(1);
    return rows[0]?.handle ? `@${rows[0].handle}` : "Someone";
  } catch {
    return "Someone";
  }
}

export async function listNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      notification: outfitNotifications,
      actorUsername: outfitAccounts.username,
      actorDisplayUsername: outfitAccounts.displayUsername,
      actorAvatarUrl: outfitAccounts.avatarUrl,
    })
    .from(outfitNotifications)
    .leftJoin(
      outfitAccounts,
      eq(outfitAccounts.userId, outfitNotifications.actorId)
    )
    .where(eq(outfitNotifications.userId, userId))
    .orderBy(desc(outfitNotifications.createdAt))
    .limit(INBOX_LIMIT);
}

export async function unreadCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: count() })
    .from(outfitNotifications)
    .where(
      and(
        eq(outfitNotifications.userId, userId),
        isNull(outfitNotifications.readAt)
      )
    );
  return Number(rows[0]?.n ?? 0);
}

/** Marks everything read. Opening the page is the acknowledgement. */
export async function markAllRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(outfitNotifications)
    .set({ readAt: sql`NOW()` })
    .where(
      and(
        eq(outfitNotifications.userId, userId),
        isNull(outfitNotifications.readAt)
      )
    );
}

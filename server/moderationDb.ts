/**
 * Reporting, blocking and taking things down.
 *
 * Two different mechanisms, deliberately. Blocking is instant and needs nobody
 * to agree with you: whoever you block disappears from your feed and you from
 * theirs, the moment you tap it. Reporting goes to a person, because deciding
 * whether a photograph breaks a rule is a judgement and pretending otherwise
 * gets it wrong in both directions.
 *
 * A post that gets taken down is hidden, never deleted. The author keeps their
 * photograph, the feed loses it, and a wrong call can be undone.
 */
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  outfitAccounts,
  outfitBlocks,
  outfitComments,
  outfitPosts,
  outfitReports,
  users,
  type InsertOutfitReport,
} from "../drizzle/schema";

export class ModerationError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST"
  ) {
    super(message);
    this.name = "ModerationError";
  }
}

/** Every reason someone can pick, in the order they're offered. */
export const REPORT_REASONS = [
  "nudity",
  "harassment",
  "hate",
  "violence",
  "spam",
  "not_their_photo",
  "under_age",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * Reasons that mean "get this off the site now, ask questions after".
 *
 * The cost of hiding a photograph that turns out to be fine is a mild
 * annoyance and an undo. The cost of leaving one of these up while a queue is
 * worked through is not comparable, so it does not wait for a human.
 */
const HIDE_ON_SIGHT: ReadonlySet<ReportReason> = new Set<ReportReason>([
  "nudity",
  "under_age",
]);

/** How many reports of any kind before a post is hidden pending review. */
const REPORTS_BEFORE_HIDING = 3;

// ─── Reporting ────────────────────────────────────────────────────────────────

export async function reportPost(
  postId: number,
  reporterId: number,
  reason: ReportReason,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [post] = await db
    .select({ id: outfitPosts.id, userId: outfitPosts.userId })
    .from(outfitPosts)
    .where(eq(outfitPosts.id, postId))
    .limit(1);
  if (!post) throw new ModerationError("Outfit not found", "NOT_FOUND");

  const already = await db
    .select({ id: outfitReports.id })
    .from(outfitReports)
    .where(
      and(
        eq(outfitReports.postId, postId),
        eq(outfitReports.reporterId, reporterId)
      )
    )
    .limit(1);
  if (already[0]) {
    throw new ModerationError("You have already reported this", "CONFLICT");
  }

  await db.insert(outfitReports).values({
    reporterId,
    postId,
    reportedUserId: post.userId,
    reason,
    note: note?.slice(0, 500),
  });

  const hidden = await hideIfWarranted(postId, reason);
  return { reported: true, hidden };
}

export async function reportComment(
  commentId: number,
  reporterId: number,
  reason: ReportReason,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [comment] = await db
    .select({ id: outfitComments.id, userId: outfitComments.userId })
    .from(outfitComments)
    .where(eq(outfitComments.id, commentId))
    .limit(1);
  if (!comment) throw new ModerationError("Comment not found", "NOT_FOUND");

  await db
    .insert(outfitReports)
    .values({
      reporterId,
      commentId,
      reportedUserId: comment.userId,
      reason,
      note: note?.slice(0, 500),
    })
    .onDuplicateKeyUpdate({ set: { reason } });

  return { reported: true, hidden: false };
}

/**
 * Hides a post if the reason is one that shouldn't wait, or if enough
 * different people have now reported it. Returns whether it hid anything.
 */
async function hideIfWarranted(postId: number, reason: ReportReason) {
  const db = await getDb();
  if (!db) return false;

  const [{ n }] = await db
    .select({ n: count() })
    .from(outfitReports)
    .where(eq(outfitReports.postId, postId));

  const urgent = HIDE_ON_SIGHT.has(reason);
  if (!urgent && Number(n) < REPORTS_BEFORE_HIDING) return false;

  await db
    .update(outfitPosts)
    .set({
      hiddenAt: sql`NOW()`,
      hiddenReason: urgent
        ? `Reported as ${reason.replace(/_/g, " ")} — hidden pending review`
        : `Reported by ${n} people — hidden pending review`,
    })
    .where(and(eq(outfitPosts.id, postId), isNull(outfitPosts.hiddenAt)));
  return true;
}

// ─── The queue ────────────────────────────────────────────────────────────────

export async function openReports(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      report: outfitReports,
      post: outfitPosts,
      reportedUsername: outfitAccounts.displayUsername,
      reporterName: users.name,
    })
    .from(outfitReports)
    .leftJoin(outfitPosts, eq(outfitPosts.id, outfitReports.postId))
    .leftJoin(
      outfitAccounts,
      eq(outfitAccounts.userId, outfitReports.reportedUserId)
    )
    .leftJoin(users, eq(users.id, outfitReports.reporterId))
    .where(eq(outfitReports.status, "open"))
    .orderBy(outfitReports.createdAt)
    .limit(limit);
}

export async function countOpenReports(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(outfitReports)
    .where(eq(outfitReports.status, "open"));
  return Number(row?.n ?? 0);
}

/** Takes the post down and closes every open report against it. */
export async function upholdReport(
  reportId: number,
  moderatorId: number,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [report] = await db
    .select()
    .from(outfitReports)
    .where(eq(outfitReports.id, reportId))
    .limit(1);
  if (!report) throw new ModerationError("Report not found", "NOT_FOUND");

  if (report.postId) {
    await db
      .update(outfitPosts)
      .set({
        hiddenAt: sql`NOW()`,
        hiddenReason: note?.slice(0, 200) ?? "Removed after review",
      })
      .where(eq(outfitPosts.id, report.postId));
    await closeReportsFor(report.postId, moderatorId, "actioned");
  } else {
    await resolve(reportId, moderatorId, "actioned");
  }
  return { actioned: true };
}

/** Leaves the post up and closes every open report against it. */
export async function dismissReport(reportId: number, moderatorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [report] = await db
    .select()
    .from(outfitReports)
    .where(eq(outfitReports.id, reportId))
    .limit(1);
  if (!report) throw new ModerationError("Report not found", "NOT_FOUND");

  if (report.postId) {
    // Dismissing means the post was fine, so an automatic hide is undone.
    await db
      .update(outfitPosts)
      .set({ hiddenAt: null, hiddenReason: null })
      .where(eq(outfitPosts.id, report.postId));
    await closeReportsFor(report.postId, moderatorId, "dismissed");
  } else {
    await resolve(reportId, moderatorId, "dismissed");
  }
  return { dismissed: true };
}

async function closeReportsFor(
  postId: number,
  moderatorId: number,
  status: "actioned" | "dismissed"
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(outfitReports)
    .set({ status, resolvedBy: moderatorId, resolvedAt: sql`NOW()` })
    .where(
      and(eq(outfitReports.postId, postId), eq(outfitReports.status, "open"))
    );
}

async function resolve(
  reportId: number,
  moderatorId: number,
  status: "actioned" | "dismissed"
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(outfitReports)
    .set({ status, resolvedBy: moderatorId, resolvedAt: sql`NOW()` })
    .where(eq(outfitReports.id, reportId));
}

// ─── Blocking ─────────────────────────────────────────────────────────────────

export async function block(blockerId: number, blockedId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (blockerId === blockedId) {
    throw new ModerationError("You cannot block yourself", "BAD_REQUEST");
  }
  await db
    .insert(outfitBlocks)
    .values({ blockerId, blockedId })
    // Blocking twice is the same as blocking once, not an error.
    .onDuplicateKeyUpdate({ set: { blockerId } });
  return { blocked: true };
}

export async function unblock(blockerId: number, blockedId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(outfitBlocks)
    .where(
      and(
        eq(outfitBlocks.blockerId, blockerId),
        eq(outfitBlocks.blockedId, blockedId)
      )
    );
  return { blocked: false };
}

/**
 * Everyone this person should not see, in either direction.
 *
 * Blocking cuts both ways on purpose: someone you blocked shouldn't be able to
 * follow you around the app just because they didn't block you back.
 */
export async function hiddenFrom(userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      blockerId: outfitBlocks.blockerId,
      blockedId: outfitBlocks.blockedId,
    })
    .from(outfitBlocks)
    .where(
      or(
        eq(outfitBlocks.blockerId, userId),
        eq(outfitBlocks.blockedId, userId)
      )
    );

  const others = new Set<number>();
  for (const row of rows) {
    others.add(row.blockerId === userId ? row.blockedId : row.blockerId);
  }
  return Array.from(others);
}

export async function isBlocked(blockerId: number, blockedId: number) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: outfitBlocks.id })
    .from(outfitBlocks)
    .where(
      and(
        eq(outfitBlocks.blockerId, blockerId),
        eq(outfitBlocks.blockedId, blockedId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** Who this person has blocked, for a list they can undo from. */
export async function blockedList(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      userId: outfitBlocks.blockedId,
      username: outfitAccounts.username,
      displayUsername: outfitAccounts.displayUsername,
      avatarUrl: outfitAccounts.avatarUrl,
      blockedAt: outfitBlocks.createdAt,
    })
    .from(outfitBlocks)
    .leftJoin(outfitAccounts, eq(outfitAccounts.userId, outfitBlocks.blockedId))
    .where(eq(outfitBlocks.blockerId, userId))
    .orderBy(desc(outfitBlocks.createdAt));
}

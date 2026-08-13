/**
 * Weekly challenges.
 *
 * A challenge is a theme and a deadline — "all black, no logos", closing
 * Sunday night. People enter outfits they have already posted, so entering is
 * one tap rather than another upload, and the same outfit can be in the
 * ordinary feed and in a challenge at once.
 *
 * Winning is decided by the rating the crowd gave, not by anyone's judgement:
 * highest average star rating among the entries, with the head-to-head rating
 * breaking ties. An entry with no ratings at all cannot win, so a late entry
 * nobody saw can't take it on a technicality.
 */
import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  outfitAccounts,
  outfitChallengeEntries,
  outfitChallenges,
  outfitPosts,
  users,
  type InsertOutfitChallenge,
} from "../drizzle/schema";
import { notify } from "./notificationsDb";

export class ChallengeError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CLOSED" | "DUPLICATE" | "FORBIDDEN"
  ) {
    super(message);
    this.name = "ChallengeError";
  }
}

/** An entry needs at least this many ratings before it can win. */
const MIN_RATINGS_TO_WIN = 1;

/**
 * The themes, in order. Which one is running is worked out from the week
 * number, so there's no scheduler and nothing to remember to do on a Monday —
 * the week decides, and the list simply repeats when it runs out.
 */
const THEMES = [
  {
    title: "All black, no logos",
    prompt:
      "One colour, top to bottom. No branding on show. Show what you can do with shape and texture when colour isn't doing any of the work.",
  },
  {
    title: "Under fifty quid",
    prompt:
      "Everything you're wearing, secondhand or not, adding up to less than fifty pounds. Say what it cost in the caption.",
  },
  {
    title: "One jacket, three ways",
    prompt:
      "Same outer layer, three different outfits. Post whichever one you think is strongest.",
  },
  {
    title: "Dressed for the weather",
    prompt:
      "Whatever it's actually doing outside your window today. Rain counts. Wind counts.",
  },
  {
    title: "Something borrowed",
    prompt:
      "One piece that isn't yours — a friend's, a parent's, a charity shop find with someone else's history in it.",
  },
  {
    title: "Colour clash",
    prompt:
      "Two colours nobody would put together. Make it work anyway.",
  },
  {
    title: "Nine to nine",
    prompt: "One outfit that gets you through work and whatever comes after.",
  },
  {
    title: "Texture over pattern",
    prompt:
      "Knit, leather, denim, corduroy, silk. No prints. Let the materials do the talking.",
  },
] as const;

/** How long each challenge runs. */
const CHALLENGE_DAYS = 7;

/**
 * The challenge running now, starting one if there isn't one.
 *
 * The slug is derived from the week, so two people opening the app at the same
 * moment ask for the same challenge, and the unique index on the slug means
 * only one of them creates it.
 */
export async function currentChallenge() {
  const db = await getDb();
  if (!db) return undefined;

  const running = await db
    .select()
    .from(outfitChallenges)
    .where(gt(outfitChallenges.endsAt, sql`NOW()`))
    .orderBy(outfitChallenges.endsAt)
    .limit(1);
  if (running[0]) return running[0];

  const week = weekNumber(new Date());
  const theme = THEMES[week % THEMES.length];
  const slug = `w${week}-${theme.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + CHALLENGE_DAYS * 86_400_000);

  try {
    await db
      .insert(outfitChallenges)
      .values({ slug, title: theme.title, prompt: theme.prompt, startsAt, endsAt });
  } catch {
    // Someone else created it in the moment between the read and the write.
  }
  return challengeBySlug(slug);
}

/** Weeks since the epoch — a number that only changes once a week. */
function weekNumber(at: Date): number {
  return Math.floor(at.getTime() / (7 * 86_400_000));
}

export async function challengeBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(outfitChallenges)
    .where(eq(outfitChallenges.slug, slug))
    .limit(1);
  return rows[0];
}

/** Finished challenges, most recently closed first. */
export async function pastChallenges(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(outfitChallenges)
    .where(lte(outfitChallenges.endsAt, sql`NOW()`))
    .orderBy(desc(outfitChallenges.endsAt))
    .limit(limit);
}

export async function createChallenge(challenge: InsertOutfitChallenge) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(outfitChallenges).values(challenge);
  return result.insertId;
}

export async function listEntries(challengeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      post: outfitPosts,
      entryId: outfitChallengeEntries.id,
      authorName: users.name,
      authorUsername: outfitAccounts.username,
      authorDisplayUsername: outfitAccounts.displayUsername,
      authorAvatarUrl: outfitAccounts.avatarUrl,
    })
    .from(outfitChallengeEntries)
    .innerJoin(outfitPosts, eq(outfitPosts.id, outfitChallengeEntries.postId))
    .leftJoin(users, eq(users.id, outfitPosts.userId))
    .leftJoin(outfitAccounts, eq(outfitAccounts.userId, outfitPosts.userId))
    .where(
      and(
        eq(outfitChallengeEntries.challengeId, challengeId),
        isNull(outfitPosts.hiddenAt)
      )
    )
    .orderBy(desc(outfitPosts.eloRating));
}

export async function enter(
  challengeId: number,
  postId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const challenge = (
    await db
      .select()
      .from(outfitChallenges)
      .where(eq(outfitChallenges.id, challengeId))
      .limit(1)
  )[0];
  if (!challenge) throw new ChallengeError("Challenge not found", "NOT_FOUND");
  if (challenge.endsAt.getTime() <= Date.now()) {
    throw new ChallengeError("This challenge has closed", "CLOSED");
  }

  const post = (
    await db.select().from(outfitPosts).where(eq(outfitPosts.id, postId)).limit(1)
  )[0];
  if (!post) throw new ChallengeError("Outfit not found", "NOT_FOUND");
  if (post.userId !== userId) {
    throw new ChallengeError("That outfit is not yours to enter", "FORBIDDEN");
  }

  const already = await db
    .select({ id: outfitChallengeEntries.id })
    .from(outfitChallengeEntries)
    .where(
      and(
        eq(outfitChallengeEntries.challengeId, challengeId),
        eq(outfitChallengeEntries.postId, postId)
      )
    )
    .limit(1);
  if (already[0]) {
    throw new ChallengeError("That outfit is already entered", "DUPLICATE");
  }

  await db
    .insert(outfitChallengeEntries)
    .values({ challengeId, postId, userId });
  return { entered: true };
}

export async function withdraw(
  challengeId: number,
  postId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(outfitChallengeEntries)
    .where(
      and(
        eq(outfitChallengeEntries.challengeId, challengeId),
        eq(outfitChallengeEntries.postId, postId),
        eq(outfitChallengeEntries.userId, userId)
      )
    );
  return { entered: false };
}

/** Which of someone's posts are already in this challenge. */
export async function myEntries(challengeId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ postId: outfitChallengeEntries.postId })
    .from(outfitChallengeEntries)
    .where(
      and(
        eq(outfitChallengeEntries.challengeId, challengeId),
        eq(outfitChallengeEntries.userId, userId)
      )
    );
  return rows.map((r: { postId: number }) => r.postId);
}

/**
 * Closes every challenge whose deadline has passed and picks its winner.
 *
 * Safe to call as often as you like — a challenge that already has a
 * `settledAt` is skipped, so two calls at the same moment can't crown two
 * different winners or send the same message twice.
 */
export async function settleFinishedChallenges() {
  const db = await getDb();
  if (!db) return [];

  const due = await db
    .select()
    .from(outfitChallenges)
    .where(
      and(
        lte(outfitChallenges.endsAt, sql`NOW()`),
        isNull(outfitChallenges.settledAt)
      )
    );

  const settled: { slug: string; winnerPostId: number | null }[] = [];

  for (const challenge of due) {
    const ranked = await db
      .select({
        postId: outfitPosts.id,
        userId: outfitPosts.userId,
        ratingCount: outfitPosts.ratingCount,
        average: sql<number>`${outfitPosts.ratingSum} / NULLIF(${outfitPosts.ratingCount}, 0)`,
        elo: outfitPosts.eloRating,
      })
      .from(outfitChallengeEntries)
      .innerJoin(outfitPosts, eq(outfitPosts.id, outfitChallengeEntries.postId))
      .where(
        and(
          eq(outfitChallengeEntries.challengeId, challenge.id),
          isNull(outfitPosts.hiddenAt),
          sql`${outfitPosts.ratingCount} >= ${MIN_RATINGS_TO_WIN}`
        )
      )
      .orderBy(
        desc(
          sql`${outfitPosts.ratingSum} / NULLIF(${outfitPosts.ratingCount}, 0)`
        ),
        desc(outfitPosts.eloRating)
      )
      .limit(1);

    const winner = ranked[0];

    // Claiming the challenge before announcing anything: if two of these run
    // at once, only one gets the row and only one sends the message.
    const [claim] = await db
      .update(outfitChallenges)
      .set({ settledAt: sql`NOW()`, winnerPostId: winner?.postId ?? null })
      .where(
        and(
          eq(outfitChallenges.id, challenge.id),
          isNull(outfitChallenges.settledAt)
        )
      );
    if (claim.affectedRows === 0) continue;

    if (winner) {
      await notify({
        userId: winner.userId,
        kind: "challenge_won",
        postId: winner.postId,
        challengeId: challenge.id,
        body: `You won "${challenge.title}"`,
      });
    }
    settled.push({ slug: challenge.slug, winnerPostId: winner?.postId ?? null });
  }

  return settled;
}

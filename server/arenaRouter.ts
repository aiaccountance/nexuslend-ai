/**
 * Notifications, challenges and search.
 *
 * These three sit together because they're the parts that bring someone back
 * rather than the parts that make something: a reason to open the app, a
 * reason to post this week, and a way to find what you came for.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as notificationsDb from "./notificationsDb";
import * as challengesDb from "./challengesDb";
import * as searchDb from "./searchDb";
import * as accountsDb from "./accountsDb";
import * as outfitsDb from "./outfitsDb";

const CATEGORY_ENUM = z.enum([
  "casual",
  "streetwear",
  "formal",
  "athletic",
  "vintage",
  "other",
]);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(v => typeof v === "string") : [];
}

/** Posts come back with their tags parsed and their star average worked out. */
function withAvgRating<
  T extends {
    post: { ratingSum: number; ratingCount: number; aiTags: unknown };
  },
>(row: T) {
  return {
    ...row,
    post: { ...row.post, aiTags: asStringArray(row.post.aiTags) },
    avgRating:
      row.post.ratingCount > 0
        ? row.post.ratingSum / row.post.ratingCount
        : null,
  };
}

function toTrpcError(error: unknown): never {
  if (error instanceof challengesDb.ChallengeError) {
    // A duplicate entry is the caller asking for something that already
    // happened, which is a bad request, not a server problem.
    const code =
      error.code === "NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

export const arenaRouter = router({
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return notificationsDb.listNotifications(ctx.user.id);
    }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return notificationsDb.unreadCount(ctx.user.id);
    }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await notificationsDb.markAllRead(ctx.user.id);
      return { success: true };
    }),
  }),

  challenges: router({
    // Reading the current challenge is also when finished ones get closed and
    // their winners announced. There's no scheduler here, and a challenge
    // nobody looks at doesn't need settling yet.
    current: publicProcedure.query(async () => {
      await challengesDb.settleFinishedChallenges();
      const challenge = await challengesDb.currentChallenge();
      if (!challenge) return null;
      const entries = await challengesDb.listEntries(challenge.id);
      return {
        challenge,
        entryCount: entries.length,
        entries: entries.slice(0, 12).map(withAvgRating),
      };
    }),

    bySlug: publicProcedure
      .input(z.object({ slug: z.string().min(1).max(80) }))
      .query(async ({ input }) => {
        const challenge = await challengesDb.challengeBySlug(input.slug);
        if (!challenge) return null;
        const entries = await challengesDb.listEntries(challenge.id);
        return {
          challenge,
          entryCount: entries.length,
          entries: entries.map(withAvgRating),
        };
      }),

    past: publicProcedure.query(async () => {
      return challengesDb.pastChallenges();
    }),

    // Your own outfits, to pick one to enter with.
    myOutfits: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(30).default(12) }))
      .query(async ({ ctx, input }) => {
        const posts = await outfitsDb.listOutfitFeed({
          sort: "new",
          limit: input.limit,
          offset: 0,
          userId: ctx.user.id,
        });
        return posts.map(withAvgRating);
      }),

    myEntries: protectedProcedure
      .input(z.object({ challengeId: z.number() }))
      .query(async ({ ctx, input }) => {
        return challengesDb.myEntries(input.challengeId, ctx.user.id);
      }),

    enter: protectedProcedure
      .input(z.object({ challengeId: z.number(), postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await challengesDb.enter(
            input.challengeId,
            input.postId,
            ctx.user.id
          );
        } catch (error) {
          toTrpcError(error);
        }
      }),

    withdraw: protectedProcedure
      .input(z.object({ challengeId: z.number(), postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return challengesDb.withdraw(
          input.challengeId,
          input.postId,
          ctx.user.id
        );
      }),
  }),

  search: router({
    // One box, three kinds of answer. A query too short to be meaningful comes
    // back empty rather than returning half the app.
    everything: publicProcedure
      .input(z.object({ query: z.string().trim().max(80) }))
      .query(async ({ input }) => {
        if (input.query.length < searchDb.MIN_QUERY_LENGTH) {
          return { people: [], outfits: [] };
        }
        const [people, outfits] = await Promise.all([
          accountsDb.searchAccounts(input.query, 8),
          searchDb.searchPosts(input.query),
        ]);
        return { people, outfits: outfits.map(withAvgRating) };
      }),

    byCategory: publicProcedure
      .input(z.object({ category: CATEGORY_ENUM }))
      .query(async ({ input }) => {
        const outfits = await searchDb.postsByCategory(input.category);
        return outfits.map(withAvgRating);
      }),

    trendingTags: publicProcedure.query(async () => {
      return searchDb.trendingTags();
    }),
  }),
});

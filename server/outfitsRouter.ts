import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { claudeJson } from "./_core/claude";
import { storagePut } from "./storage";
import * as outfitsDb from "./outfitsDb";
import * as accountsDb from "./accountsDb";
import * as notifications from "./notificationsDb";
import { enforce } from "./rateLimit";

const CATEGORY_ENUM = z.enum([
  "casual",
  "streetwear",
  "formal",
  "athletic",
  "vintage",
  "other",
]);
const SORT_ENUM = z.enum(["new", "top", "trending"]);
const PERIOD_ENUM = z.enum(["day", "week", "all"]);

const OUTFIT_STYLIST_SYSTEM_PROMPT = `
You are an expert fashion stylist judging an outfit photo for "Outfit Arena", a Pinterest-style outfit rating and competition app.

Fill in every field:
- tags: 3 to 6 short style, colour or garment tags, e.g. "earth tones", "oversized blazer", "streetwear".
- style_score: 0-100, overall styling quality.
- occasion: one short phrase for the best-fit occasion, e.g. "weekend brunch" or "night out".
- feedback: 2-3 sentences on what works and what doesn't.
- suggestions: 2-3 short, specific ways to elevate the look, e.g. "swap the sneakers for loafers to dress it up".

Be specific about colours, silhouette and fit. Be encouraging but honest. If the image does not clearly show an outfit, still do your best with what is visible.
`.trim();

const OUTFIT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    tags: { type: "array", items: { type: "string" }, maxItems: 6 },
    style_score: { type: "integer", minimum: 0, maximum: 100 },
    occasion: { type: "string" },
    feedback: { type: "string" },
    suggestions: { type: "array", items: { type: "string" }, maxItems: 4 },
  },
  required: ["tags", "style_score", "occasion", "feedback", "suggestions"],
  additionalProperties: false,
} as const;

type AiOutfitAnalysis = {
  tags: string[];
  style_score: number;
  occasion: string;
  feedback: string;
  suggestions: string[];
};

const UNAVAILABLE_ANALYSIS: AiOutfitAnalysis = {
  tags: [],
  style_score: 50,
  occasion: "everyday",
  feedback: "AI styling feedback is temporarily unavailable for this photo.",
  suggestions: [],
};

/**
 * Best-effort: a stylist-model outage must never cost the user their upload,
 * so every failure path degrades to a neutral placeholder analysis.
 */
async function analyseOutfitImage(dataUri: string): Promise<AiOutfitAnalysis> {
  try {
    return await requestOutfitAnalysis(dataUri);
  } catch (err) {
    console.error("[Outfit Arena] AI stylist analysis failed:", err);
    return UNAVAILABLE_ANALYSIS;
  }
}

async function requestOutfitAnalysis(
  dataUri: string
): Promise<AiOutfitAnalysis> {
  // The critique is the whole point of the upload, so this call thinks.
  const parsed = await claudeJson<Partial<AiOutfitAnalysis>>({
    system: OUTFIT_STYLIST_SYSTEM_PROMPT,
    text: "Analyse this outfit photo.",
    images: [dataUri],
    schema: OUTFIT_ANALYSIS_SCHEMA,
    maxTokens: 4096,
    effort: "medium",
    thinking: true,
  });

  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map(String) : [],
    style_score:
      typeof parsed.style_score === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.style_score)))
        : 50,
    occasion:
      typeof parsed.occasion === "string" ? parsed.occasion : "everyday",
    feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.slice(0, 4).map(String)
      : [],
  };
}

/**
 * JSON columns come back parsed on some MySQL-compatible engines (TiDB) and as
 * raw strings on others (MariaDB), so normalise to an array either way.
 */
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Surface rule violations as 4xx codes with their message intact. */
async function enforcingRules<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof outfitsDb.OutfitRuleError) {
      throw new TRPCError({ code: err.code, message: err.message });
    }
    throw err;
  }
}

function withAvgRating<
  T extends {
    post: {
      ratingSum: number;
      ratingCount: number;
      aiTags: unknown;
      aiSuggestions: unknown;
    };
  },
>(row: T) {
  return {
    ...row,
    post: {
      ...row.post,
      aiTags: asStringArray(row.post.aiTags),
      aiSuggestions: asStringArray(row.post.aiSuggestions),
    },
    avgRating:
      row.post.ratingCount > 0
        ? row.post.ratingSum / row.post.ratingCount
        : null,
  };
}

export const outfitsRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        // ~12MB of image once base64-decoded; the client blocks this earlier
        // with a friendlier message, this is the backstop.
        fileBase64: z.string().min(1).max(17_000_000),
        mimeType: z.string().startsWith("image/"),
        caption: z.string().max(500).optional(),
        category: CATEGORY_ENUM.default("other"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Every upload runs a vision model and writes a file, so this is the
      // most expensive thing anyone can ask for.
      enforce("upload", ctx.user.id);

      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.mimeType.split("/")[1] || "jpg";
      const key = `outfit-arena/${ctx.user.id}-${Date.now()}.${ext}`;
      const { url, key: storedKey } = await storagePut(
        key,
        buffer,
        input.mimeType
      );

      const dataUri = `data:${input.mimeType};base64,${input.fileBase64}`;
      const analysis = await analyseOutfitImage(dataUri);

      const result = await outfitsDb.createOutfitPost({
        userId: ctx.user.id,
        imageUrl: url,
        imageKey: storedKey,
        caption: input.caption,
        category: input.category,
        aiTags: analysis.tags,
        aiStyleScore: analysis.style_score,
        aiOccasion: analysis.occasion,
        aiFeedback: analysis.feedback,
        aiSuggestions: analysis.suggestions,
      });

      const insertId = (result as { insertId?: number })?.insertId;
      const row = insertId
        ? await outfitsDb.getOutfitPostById(insertId)
        : undefined;

      return {
        success: true,
        post: row ? withAvgRating(row) : undefined,
        analysis,
      };
    }),

  feed: publicProcedure
    .input(
      z.object({
        sort: SORT_ENUM.default("new"),
        limit: z.number().min(1).max(50).default(24),
        // Where the last page stopped. Absent means start at the beginning.
        cursor: z
          .object({ value: z.string(), id: z.number() })
          .nullish(),
        category: CATEGORY_ENUM.optional(),
      })
    )
    .query(async ({ input }) => {
      const rows = await outfitsDb.listOutfitFeed({
        sort: input.sort,
        limit: input.limit,
        cursor: input.cursor ?? undefined,
        category: input.category,
      });
      const last = rows[rows.length - 1];
      return {
        posts: rows.map(withAvgRating),
        // Null once a page comes back short, which is how the client knows
        // there is nothing more to ask for.
        nextCursor:
          last && rows.length === input.limit
            ? outfitsDb.cursorAfter(input.sort, last.post)
            : null,
      };
    }),

  getPost: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const row = await outfitsDb.getOutfitPostById(input.id);
      if (!row) return null;
      const userRating = ctx.user
        ? await outfitsDb.getUserRatingForPost(input.id, ctx.user.id)
        : undefined;
      return { ...withAvgRating(row), userRating: userRating?.rating ?? null };
    }),

  rate: protectedProcedure
    .input(
      z.object({ postId: z.number(), rating: z.number().int().min(1).max(5) })
    )
    .mutation(async ({ ctx, input }) => {
      await enforcingRules(() =>
        outfitsDb.rateOutfitPost(input.postId, ctx.user.id, input.rating)
      );

      const post = await outfitsDb.getOutfitPostById(input.postId);
      if (post) {
        const who = await notifications.handleFor(ctx.user.id);
        await notifications.notify({
          userId: post.post.userId,
          actorId: ctx.user.id,
          kind: "rating",
          postId: input.postId,
          body: `${who} gave your outfit ${input.rating} star${input.rating === 1 ? "" : "s"}`,
        });
      }
      return { success: true };
    }),

  deletePost: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await outfitsDb.deleteOutfitPost(input.id, ctx.user.id);
      return { success: true };
    }),

  battle: router({
    next: publicProcedure.query(async ({ ctx }) => {
      const pair = await outfitsDb.getRandomMatchupPair(ctx.user?.id);
      if (pair.length < 2) return null;
      return { postA: pair[0], postB: pair[1] };
    }),

    vote: protectedProcedure
      .input(
        z.object({
          postAId: z.number(),
          postBId: z.number(),
          winnerId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { newEloA, newEloB } = await enforcingRules(() =>
          outfitsDb.recordBattleVote(
            input.postAId,
            input.postBId,
            input.winnerId,
            ctx.user.id
          )
        );

        // Both sides hear about it. Losing quietly is how people stop coming
        // back; losing to a named outfit is a reason to post another one.
        const loserId =
          input.winnerId === input.postAId ? input.postBId : input.postAId;
        const [winner, loser] = await Promise.all([
          outfitsDb.getOutfitPostById(input.winnerId),
          outfitsDb.getOutfitPostById(loserId),
        ]);
        if (winner) {
          await notifications.notify({
            userId: winner.post.userId,
            actorId: ctx.user.id,
            kind: "battle_won",
            postId: input.winnerId,
            body: "Your outfit won a head-to-head",
          });
        }
        if (loser) {
          await notifications.notify({
            userId: loser.post.userId,
            actorId: ctx.user.id,
            kind: "battle_lost",
            postId: loserId,
            body: "Your outfit lost a head-to-head — it still counts towards your rating",
          });
        }
        return { success: true, newEloA, newEloB };
      }),
  }),

  outfitOfTheWeek: publicProcedure.query(async () => {
    const row = await outfitsDb.outfitOfTheWeek();
    return row ? withAvgRating(row) : null;
  }),

  leaderboard: router({
    posts: publicProcedure
      .input(
        z.object({
          period: PERIOD_ENUM.default("week"),
          limit: z.number().min(1).max(50).default(20),
        })
      )
      .query(async ({ input }) => {
        const rows = await outfitsDb.leaderboardPosts(
          input.period,
          input.limit
        );
        return rows.map(withAvgRating);
      }),

    users: publicProcedure
      .input(
        z.object({
          period: PERIOD_ENUM.default("week"),
          limit: z.number().min(1).max(50).default(20),
        })
      )
      .query(async ({ input }) => {
        return outfitsDb.leaderboardUsers(input.period, input.limit);
      }),
  }),

  profile: router({
    get: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        const user = await outfitsDb.getUserByIdPublic(input.userId);
        if (!user) return null;
        const account = await accountsDb.getAccountByUserId(input.userId);
        const [stats, posts, followerCount, followingCount, following] =
          await Promise.all([
            outfitsDb.getUserProfileStats(input.userId),
            outfitsDb.listOutfitFeed({
              sort: "new",
              limit: 50,
              offset: 0,
              userId: input.userId,
            }),
            outfitsDb.getFollowerCount(input.userId),
            outfitsDb.getFollowingCount(input.userId),
            ctx.user
              ? outfitsDb.isFollowing(ctx.user.id, input.userId)
              : Promise.resolve(false),
          ]);
        return {
          user: {
            id: user.id,
            name: user.name,
            username: account?.username ?? null,
            displayUsername: account?.displayUsername ?? null,
            avatarUrl: account?.avatarUrl ?? null,
            bio: account?.bio ?? null,
          },
          stats,
          posts: posts.map(withAvgRating),
          followerCount,
          followingCount,
          isFollowing: following,
          isSelf: ctx.user?.id === input.userId,
        };
      }),
  }),

  follow: router({
    toggle: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const result = await enforcingRules(() =>
          outfitsDb.toggleFollow(ctx.user.id, input.userId)
        );
        if (result.following) {
          const who = await notifications.handleFor(ctx.user.id);
          await notifications.notify({
            userId: input.userId,
            actorId: ctx.user.id,
            kind: "follow",
            body: `${who} started following you`,
          });
        }
        return result;
      }),
  }),
});

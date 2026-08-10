import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import * as wardrobeDb from "./wardrobeDb";
import * as outfitsDb from "./outfitsDb";
import {
  generateCleanGarmentShot,
  generateOutfitRender,
} from "./wardrobeImages";

const SLOT_ENUM = z.enum([
  "top",
  "bottom",
  "outerwear",
  "shoes",
  "accessory",
  "dress",
]);

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

/** storagePut and generateImage both return /manus-storage/<key> paths. */
function keyFromStorageUrl(url: string): string {
  return url.replace(/^\/manus-storage\//, "");
}

function asNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map(Number).filter(Number.isFinite)
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Garment classification ───────────────────────────────────────────────────
const GARMENT_SYSTEM_PROMPT = `
You are a fashion cataloguer adding a single clothing item to a user's digital wardrobe.

Look at the photo of ONE garment or accessory and return ONLY valid JSON (no markdown):
{
  "name": "short human name for the item, e.g. 'cream oversized knit'",
  "slot": one of "top" | "bottom" | "outerwear" | "shoes" | "accessory" | "dress",
  "colour": "dominant colour in plain words, e.g. 'cream' or 'navy'",
  "tags": ["2 to 5 short descriptors: fabric, pattern, fit, formality"],
  "notes": "one sentence on what this pairs well with"
}

Pick the single best slot. A full-length one-piece is "dress". Bags, hats, belts, jewellery and scarves are "accessory".
`.trim();

type GarmentAnalysis = {
  name: string;
  slot: z.infer<typeof SLOT_ENUM>;
  colour: string;
  tags: string[];
  notes: string;
};

const UNKNOWN_GARMENT: GarmentAnalysis = {
  name: "Untitled item",
  slot: "top",
  colour: "",
  tags: [],
  notes: "",
};

const VALID_SLOTS = SLOT_ENUM.options as readonly string[];

/** Best effort — a model outage must not stop someone cataloguing clothes. */
async function classifyGarment(dataUri: string): Promise<GarmentAnalysis> {
  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: GARMENT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Catalogue this garment." },
            { type: "image_url", image_url: { url: dataUri, detail: "low" } },
          ],
        },
      ],
      max_tokens: 512,
      response_format: { type: "json_object" },
    });

    const raw = result.choices[0]?.message?.content;
    const text = typeof raw === "string" ? raw : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return UNKNOWN_GARMENT;

    const parsed = JSON.parse(match[0]) as Partial<GarmentAnalysis>;
    const slot =
      typeof parsed.slot === "string" && VALID_SLOTS.includes(parsed.slot)
        ? (parsed.slot as GarmentAnalysis["slot"])
        : "top";
    return {
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim().slice(0, 160)
          : UNKNOWN_GARMENT.name,
      slot,
      colour:
        typeof parsed.colour === "string" ? parsed.colour.slice(0, 80) : "",
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.slice(0, 5).map(String)
        : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };
  } catch (err) {
    console.error("[Wardrobe] Garment classification failed:", err);
    return UNKNOWN_GARMENT;
  }
}

// ─── Outfit recommendation ────────────────────────────────────────────────────
const STYLIST_SYSTEM_PROMPT = `
You are a personal stylist building outfits from the exact clothes a user owns.

You will be given a numbered list of wardrobe items, each with an id, slot, name, colour and tags. Propose complete outfits using ONLY those item ids.

Return ONLY valid JSON (no markdown):
{
  "outfits": [
    {
      "name": "short evocative name for the look",
      "item_ids": [ids of the items in this outfit],
      "occasion": "where this outfit works, e.g. 'office to dinner'",
      "rationale": "2 sentences on why these pieces work together (colour, proportion, formality)",
      "score": 0-100 integer for how strong the combination is
    }
  ]
}

Rules:
- Every id in item_ids MUST come from the provided list. Never invent ids.
- A valid outfit has either a "dress", or both a "top" and a "bottom". Add shoes, outerwear and accessories where they improve the look.
- Never use two items from the same slot, except accessories (max 2).
- Prefer combinations that genuinely work; if the wardrobe is thin, return fewer outfits rather than bad ones.
`.trim();

type SuggestedOutfit = {
  name: string;
  item_ids: number[];
  occasion: string;
  rationale: string;
  score: number;
};

/**
 * Drops anything the model hallucinated or mis-shaped: unknown ids, duplicate
 * slots, and combinations that aren't actually wearable.
 */
function validateSuggestions(
  raw: unknown,
  items: Array<{ id: number; slot: string }>
): SuggestedOutfit[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(items.map(i => [i.id, i]));

  const valid: SuggestedOutfit[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const ids = asNumberArray(e.item_ids).filter(id => byId.has(id));
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length < 2) continue;

    const slots = uniqueIds.map(id => byId.get(id)!.slot);
    const counts = new Map<string, number>();
    for (const s of slots) counts.set(s, (counts.get(s) ?? 0) + 1);

    const overfilled = Array.from(counts.entries()).some(([slot, n]) =>
      slot === "accessory" ? n > 2 : n > 1
    );
    if (overfilled) continue;

    const wearable =
      counts.has("dress") || (counts.has("top") && counts.has("bottom"));
    if (!wearable) continue;

    const score = Number(e.score);
    valid.push({
      name:
        typeof e.name === "string" && e.name.trim()
          ? e.name.trim().slice(0, 160)
          : "Untitled look",
      item_ids: uniqueIds,
      occasion: typeof e.occasion === "string" ? e.occasion.slice(0, 160) : "",
      rationale: typeof e.rationale === "string" ? e.rationale : "",
      score: Number.isFinite(score)
        ? Math.max(0, Math.min(100, Math.round(score)))
        : 50,
    });
  }
  return valid;
}

export const wardrobeRouter = router({
  // ── Items ────────────────────────────────────────────────────────────────
  addItem: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1).max(17_000_000),
        mimeType: z.string().startsWith("image/"),
        // Optional overrides — the AI fills these in when omitted.
        name: z.string().max(160).optional(),
        slot: SLOT_ENUM.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.mimeType.split("/")[1] || "jpg";
      const key = `wardrobe/${ctx.user.id}-${Date.now()}.${ext}`;
      const { url, key: storedKey } = await storagePut(
        key,
        buffer,
        input.mimeType
      );

      const analysis = await classifyGarment(
        `data:${input.mimeType};base64,${input.fileBase64}`
      );

      const result = await wardrobeDb.createWardrobeItem({
        userId: ctx.user.id,
        imageUrl: url,
        imageKey: storedKey,
        name: input.name?.trim() || analysis.name,
        slot: input.slot ?? analysis.slot,
        colour: analysis.colour,
        aiTags: analysis.tags,
        aiNotes: analysis.notes,
      });

      const insertId = (result as { insertId?: number })?.insertId;

      // Restage the raw photo as a clean product shot. Best-effort: the item
      // is already saved and the original photo stays as the fallback.
      if (insertId) {
        const clean = await generateCleanGarmentShot(
          input.fileBase64,
          input.mimeType
        );
        if (clean) {
          await wardrobeDb.setItemCleanShot(
            insertId,
            clean.url,
            keyFromStorageUrl(clean.url)
          );
        }
      }

      const item = insertId
        ? await wardrobeDb.getWardrobeItem(insertId)
        : undefined;

      return {
        success: true,
        item: item
          ? { ...item, aiTags: asStringArray(item.aiTags) }
          : undefined,
        analysis,
      };
    }),

  listItems: protectedProcedure
    .input(z.object({ slot: SLOT_ENUM.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const items = await wardrobeDb.listWardrobeItems(ctx.user.id, input.slot);
      return items.map(i => ({ ...i, aiTags: asStringArray(i.aiTags) }));
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await wardrobeDb.deleteWardrobeItem(input.id, ctx.user.id);
      return { success: true };
    }),

  // ── AI outfit recommendations ────────────────────────────────────────────
  suggestOutfits: protectedProcedure
    .input(
      z.object({
        occasion: z.string().max(120).optional(),
        count: z.number().min(1).max(5).default(3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const items = await wardrobeDb.listWardrobeItems(ctx.user.id);

      // A wearable outfit needs at least a top+bottom or a dress.
      const slots = new Set(items.map(i => i.slot));
      const canDress =
        slots.has("dress") || (slots.has("top") && slots.has("bottom"));
      if (!canDress) {
        return {
          suggestions: [],
          reason:
            "Add at least a top and a bottom (or a dress) and I can start building outfits.",
        };
      }

      const catalogue = items
        .map(i => {
          const tags = asStringArray(i.aiTags);
          return `id=${i.id} | slot=${i.slot} | ${i.name}${
            i.colour ? ` | colour=${i.colour}` : ""
          }${tags.length ? ` | tags=${tags.join(", ")}` : ""}`;
        })
        .join("\n");

      const userMessage = [
        `Here is the user's wardrobe:\n${catalogue}`,
        input.occasion
          ? `\nThey want outfits for: ${input.occasion}`
          : "\nSuggest outfits for a mix of everyday occasions.",
        `\nPropose up to ${input.count} outfits.`,
      ].join("");

      let parsedOutfits: unknown = [];
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: STYLIST_SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 1500,
          response_format: { type: "json_object" },
        });
        const raw = result.choices[0]?.message?.content;
        const text = typeof raw === "string" ? raw : "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          parsedOutfits = (JSON.parse(match[0]) as { outfits?: unknown })
            .outfits;
        }
      } catch (err) {
        console.error("[Wardrobe] Outfit suggestion failed:", err);
        return {
          suggestions: [],
          reason:
            "The stylist is temporarily unavailable — please try again in a moment.",
        };
      }

      const suggestions = validateSuggestions(parsedOutfits, items).slice(
        0,
        input.count
      );

      return {
        suggestions: suggestions.map(s => ({
          ...s,
          items: s.item_ids
            .map(id => items.find(i => i.id === id))
            .filter((i): i is (typeof items)[number] => Boolean(i))
            .map(i => ({
              id: i.id,
              name: i.name,
              slot: i.slot,
              imageUrl: i.cleanImageUrl ?? i.imageUrl,
            })),
        })),
        reason:
          suggestions.length === 0
            ? "The stylist couldn't find a combination it was happy with. Try adding a few more pieces."
            : null,
      };
    }),

  // ── Saved outfits ────────────────────────────────────────────────────────
  saveOutfit: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(160),
        itemIds: z.array(z.number()).min(2).max(8),
        occasion: z.string().max(160).optional(),
        aiRationale: z.string().optional(),
        aiScore: z.number().min(0).max(100).optional(),
        source: z.enum(["ai", "manual"]).default("manual"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Never let someone save an outfit referencing clothes they don't own.
      const owned = await wardrobeDb.getWardrobeItemsByIds(
        ctx.user.id,
        input.itemIds
      );
      if (owned.length !== new Set(input.itemIds).size) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That outfit references items that aren't in your wardrobe",
        });
      }

      const result = await wardrobeDb.createWardrobeOutfit({
        userId: ctx.user.id,
        name: input.name,
        itemIds: input.itemIds,
        occasion: input.occasion,
        aiRationale: input.aiRationale,
        aiScore: input.aiScore,
        source: input.source,
      });
      const insertId = (result as { insertId?: number })?.insertId;
      return { success: true, id: insertId };
    }),

  listOutfits: protectedProcedure.query(async ({ ctx }) => {
    const outfits = await wardrobeDb.listWardrobeOutfits(ctx.user.id);
    const allIds = outfits.flatMap(o => asNumberArray(o.itemIds));
    const items = await wardrobeDb.getWardrobeItemsByIds(ctx.user.id, allIds);
    const byId = new Map(items.map(i => [i.id, i]));

    return outfits.map(o => ({
      ...o,
      itemIds: asNumberArray(o.itemIds),
      items: asNumberArray(o.itemIds)
        .map(id => byId.get(id))
        .filter((i): i is (typeof items)[number] => Boolean(i))
        .map(i => ({
          id: i.id,
          name: i.name,
          slot: i.slot,
          imageUrl: i.cleanImageUrl ?? i.imageUrl,
        })),
    }));
  }),

  deleteOutfit: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await wardrobeDb.deleteWardrobeOutfit(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * Publishes a saved wardrobe outfit into the competition feed. The feed post
   * reuses the hero garment's photo, since a composed outfit has no single
   * image of its own.
   */
  postToFeed: protectedProcedure
    .input(
      z.object({
        outfitId: z.number(),
        category: z
          .enum([
            "casual",
            "streetwear",
            "formal",
            "athletic",
            "vintage",
            "other",
          ])
          .default("other"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const outfit = await enforcingRules(() =>
        wardrobeDb.requireOwnedOutfit(input.outfitId, ctx.user.id)
      );
      if (outfit.postedPostId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That outfit is already in the feed",
        });
      }

      const itemIds = asNumberArray(outfit.itemIds);
      const items = await wardrobeDb.getWardrobeItemsByIds(
        ctx.user.id,
        itemIds
      );
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That outfit has no items left to show",
        });
      }

      // Cover image, best first: a render of the whole outfit being worn, then
      // the tidied shot of the most representative garment, then its raw photo.
      const coverOrder = ["dress", "top", "outerwear", "bottom", "shoes"];
      const cover =
        coverOrder.map(s => items.find(i => i.slot === s)).find(Boolean) ??
        items[0];
      const coverUrl =
        outfit.renderImageUrl ?? cover.cleanImageUrl ?? cover.imageUrl;
      const coverKey =
        outfit.renderImageKey ?? cover.cleanImageKey ?? cover.imageKey;

      const caption = [outfit.name, outfit.occasion]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500);

      const result = await outfitsDb.createOutfitPost({
        userId: ctx.user.id,
        imageUrl: coverUrl,
        imageKey: coverKey,
        caption,
        category: input.category,
        aiTags: items.map(i => i.name).slice(0, 6),
        aiStyleScore: outfit.aiScore ?? null,
        aiOccasion: outfit.occasion,
        aiFeedback: outfit.aiRationale,
        aiSuggestions: [],
      });

      const postId = (result as { insertId?: number })?.insertId;
      if (postId) {
        await wardrobeDb.markOutfitPosted(outfit.id, ctx.user.id, postId);
      }
      return { success: true, postId };
    }),

  // ── Seeing an outfit worn ────────────────────────────────────────────────
  /**
   * Generates a picture of a saved outfit being worn. Defaults to a faceless
   * mannequin; "personal" uses the user's own photo and is refused unless they
   * have uploaded one and confirmed it is of them.
   */
  renderOutfit: protectedProcedure
    .input(
      z.object({
        outfitId: z.number(),
        style: z.enum(["mannequin", "personal"]).default("mannequin"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const outfit = await enforcingRules(() =>
        wardrobeDb.requireOwnedOutfit(input.outfitId, ctx.user.id)
      );

      const items = await wardrobeDb.getWardrobeItemsByIds(
        ctx.user.id,
        asNumberArray(outfit.itemIds)
      );
      if (items.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That outfit has no items left to show",
        });
      }

      let modelImageUrl: string | null = null;
      if (input.style === "personal") {
        const model = await wardrobeDb.getWardrobeModel(ctx.user.id);
        if (!model) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Add a photo of yourself first, then you can see outfits on you",
          });
        }
        modelImageUrl = model.imageUrl;
      }

      const render = await generateOutfitRender({
        items: items.map(i => ({
          name: i.name,
          slot: i.slot,
          colour: i.colour,
          imageUrl: i.imageUrl,
          cleanImageUrl: i.cleanImageUrl,
        })),
        style: input.style,
        occasion: outfit.occasion,
        modelImageUrl,
      });

      if (!render) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Couldn't generate that look right now — please try again shortly",
        });
      }

      await wardrobeDb.setOutfitRender(
        outfit.id,
        ctx.user.id,
        render.url,
        keyFromStorageUrl(render.url),
        input.style
      );

      return { success: true, renderImageUrl: render.url, style: input.style };
    }),

  // ── The user's own photo ─────────────────────────────────────────────────
  model: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const model = await wardrobeDb.getWardrobeModel(ctx.user.id);
      return model
        ? { imageUrl: model.imageUrl, consentedAt: model.consentedAt }
        : null;
    }),

    upload: protectedProcedure
      .input(
        z.object({
          fileBase64: z.string().min(1).max(17_000_000),
          mimeType: z.string().startsWith("image/"),
          /**
           * Must be true. The photo is used to generate pictures of this person
           * wearing clothes, so we only accept it on an explicit confirmation
           * that it is the account holder themselves.
           */
          isPhotoOfMe: z.literal(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.mimeType.split("/")[1] || "jpg";
        const key = `wardrobe-model/${ctx.user.id}-${Date.now()}.${ext}`;
        const { url, key: storedKey } = await storagePut(
          key,
          buffer,
          input.mimeType
        );

        await wardrobeDb.upsertWardrobeModel({
          userId: ctx.user.id,
          imageUrl: url,
          imageKey: storedKey,
          consentedAt: new Date(),
        });

        return { success: true, imageUrl: url };
      }),

    delete: protectedProcedure.mutation(async ({ ctx }) => {
      await wardrobeDb.deleteWardrobeModel(ctx.user.id);
      return { success: true };
    }),
  }),

  // ── Comments on feed posts ───────────────────────────────────────────────
  comments: router({
    list: publicProcedure
      .input(z.object({ postId: z.number() }))
      .query(async ({ input }) => {
        return wardrobeDb.listComments(input.postId);
      }),

    add: protectedProcedure
      .input(
        z.object({
          postId: z.number(),
          body: z.string().trim().min(1).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const post = await outfitsDb.getOutfitPostById(input.postId);
        if (!post) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Outfit not found",
          });
        }
        await wardrobeDb.addComment({
          postId: input.postId,
          userId: ctx.user.id,
          body: input.body,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await wardrobeDb.deleteComment(input.id, ctx.user.id);
        return { success: true };
      }),
  }),
});

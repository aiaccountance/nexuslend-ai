import { describe, expect, it, vi, beforeAll } from "vitest";

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockImplementation(async (key: string) => ({
    key,
    url: `/manus-storage/${key}`,
  })),
}));

// Default mock classifies a garment; individual tests override per call.
vi.mock("./_core/claude", () => ({
  claudeJson: vi.fn().mockResolvedValue({
    name: "cream oversized knit",
    slot: "top",
    colour: "cream",
    tags: ["wool", "relaxed"],
    notes: "Pairs well with straight-leg denim.",
  }),
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi
    .fn()
    .mockResolvedValue({ url: "/manus-storage/generated/mock.png" }),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { getDb } from "./db";
import {
  wardrobeItems,
  wardrobeOutfits,
  wardrobeModels,
  outfitComments,
  outfitPosts,
  outfitRatings,
  outfitMatchups,
} from "../drizzle/schema";
import { claudeJson } from "./_core/claude";
import { generateImage } from "./_core/imageGeneration";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function ctxFor(user: User | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/** Queue a single JSON payload as the model's next reply. */
function mockLlmJson(payload: unknown) {
  vi.mocked(claudeJson).mockResolvedValueOnce(payload as never);
}

let mia: User;
let noah: User;
let dbAvailable = false;

beforeAll(async () => {
  const conn = await getDb();
  if (!conn) return;
  try {
    await conn.delete(wardrobeOutfits);
    await conn.delete(wardrobeModels);
    await conn.delete(wardrobeItems);
    await conn.delete(outfitComments);
    await conn.delete(outfitRatings);
    await conn.delete(outfitMatchups);
    await conn.delete(outfitPosts);

    await db.upsertUser({
      openId: "wd-mia",
      name: "Mia",
      email: "mia@test.dev",
    });
    await db.upsertUser({
      openId: "wd-noah",
      name: "Noah",
      email: "noah@test.dev",
    });
    mia = (await db.getUserByOpenId("wd-mia"))!;
    noah = (await db.getUserByOpenId("wd-noah"))!;
    dbAvailable = Boolean(mia && noah);
  } catch {
    dbAvailable = false;
  }
});

const dbIt: typeof it = ((name: string, fn: never, timeout?: number) =>
  it(
    name,
    async (ctx: { skip: () => void }) => {
      if (!dbAvailable) return ctx.skip();
      return (fn as unknown as (c: unknown) => unknown)(ctx);
    },
    timeout
  )) as typeof it;

async function addItem(
  user: User,
  slot: string,
  name: string,
  colour = "cream"
) {
  mockLlmJson({ name, slot, colour, tags: ["tag"], notes: "" });
  return appRouter.createCaller(ctxFor(user)).wardrobe.addItem({
    fileBase64: TINY_PNG_BASE64,
    mimeType: "image/png",
  });
}

/** A minimal wearable wardrobe: one top, one bottom, one pair of shoes. */
async function seedWardrobe(user: User) {
  const top = (await addItem(user, "top", "cream knit")).item!;
  const bottom = (await addItem(user, "bottom", "straight jeans")).item!;
  const shoes = (await addItem(user, "shoes", "white sneakers")).item!;
  return { top, bottom, shoes };
}

describe("wardrobe.addItem", () => {
  dbIt("catalogues a garment from the AI classification", async () => {
    mockLlmJson({
      name: "charcoal wool coat",
      slot: "outerwear",
      colour: "charcoal",
      tags: ["wool", "longline"],
      notes: "Layers over knitwear.",
    });
    const res = await appRouter.createCaller(ctxFor(mia)).wardrobe.addItem({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
    });

    expect(res.success).toBe(true);
    expect(res.item?.name).toBe("charcoal wool coat");
    expect(res.item?.slot).toBe("outerwear");
    expect(res.item?.colour).toBe("charcoal");
    expect(res.item?.aiTags).toEqual(["wool", "longline"]);
    expect(res.item?.imageUrl).toContain("/manus-storage/wardrobe/");
  });

  dbIt("lets the user override the AI's name and slot", async () => {
    mockLlmJson({ name: "ai guess", slot: "top", colour: "black", tags: [] });
    const res = await appRouter.createCaller(ctxFor(mia)).wardrobe.addItem({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
      name: "My favourite boots",
      slot: "shoes",
    });
    expect(res.item?.name).toBe("My favourite boots");
    expect(res.item?.slot).toBe("shoes");
  });

  dbIt(
    "falls back to a usable slot when the model returns nonsense",
    async () => {
      mockLlmJson({ name: "weird", slot: "spaceship", colour: "", tags: [] });
      const res = await appRouter.createCaller(ctxFor(mia)).wardrobe.addItem({
        fileBase64: TINY_PNG_BASE64,
        mimeType: "image/png",
      });
      expect(res.item?.slot).toBe("top");
    }
  );

  dbIt("still saves the item when the classifier is offline", async () => {
    vi.mocked(claudeJson).mockRejectedValueOnce(new Error("model offline"));
    const res = await appRouter.createCaller(ctxFor(mia)).wardrobe.addItem({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
    });
    expect(res.success).toBe(true);
    expect(res.item?.name).toBe("Untitled item");
  });

  dbIt("only lists the caller's own wardrobe", async () => {
    await addItem(mia, "top", "mia's tee");
    await addItem(noah, "top", "noah's tee");

    const miaItems = await appRouter
      .createCaller(ctxFor(mia))
      .wardrobe.listItems({});
    expect(miaItems.every(i => i.userId === mia.id)).toBe(true);
    expect(miaItems.some(i => i.name === "noah's tee")).toBe(false);
  });

  dbIt("filters the wardrobe by slot", async () => {
    const items = await appRouter
      .createCaller(ctxFor(mia))
      .wardrobe.listItems({ slot: "shoes" });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.slot === "shoes")).toBe(true);
  });
});

describe("wardrobe.suggestOutfits", () => {
  dbIt("asks for more clothes when no outfit is possible", async () => {
    const res = await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.suggestOutfits({ count: 3 });
    // Noah owns only a top at this point.
    expect(res.suggestions).toEqual([]);
    expect(res.reason).toMatch(/top and a bottom/i);
  });

  dbIt("returns outfits built only from items the user owns", async () => {
    const { top, bottom, shoes } = await seedWardrobe(noah);
    mockLlmJson({
      outfits: [
        {
          name: "Easy weekend",
          item_ids: [top.id, bottom.id, shoes.id],
          occasion: "weekend coffee",
          rationale: "Neutral palette with relaxed proportions.",
          score: 82,
        },
      ],
    });

    const res = await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.suggestOutfits({ count: 3 });

    expect(res.suggestions).toHaveLength(1);
    const s = res.suggestions[0];
    expect(s.name).toBe("Easy weekend");
    expect(s.score).toBe(82);
    expect(s.item_ids.sort()).toEqual([top.id, bottom.id, shoes.id].sort());
    // Hydrated with real item data for rendering
    expect(s.items).toHaveLength(3);
    expect(s.items.map(i => i.slot).sort()).toEqual(["bottom", "shoes", "top"]);
  });

  dbIt("discards suggestions referencing items that don't exist", async () => {
    const { top, bottom } = await seedWardrobe(noah);
    mockLlmJson({
      outfits: [
        { name: "Hallucinated", item_ids: [999999, 888888], score: 90 },
        {
          name: "Real",
          item_ids: [top.id, bottom.id],
          rationale: "ok",
          score: 70,
        },
      ],
    });

    const res = await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.suggestOutfits({ count: 5 });

    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0].name).toBe("Real");
  });

  dbIt("discards unwearable combinations", async () => {
    const { top, shoes } = await seedWardrobe(noah);
    mockLlmJson({
      // Top + shoes with no bottom is not a wearable outfit.
      outfits: [
        { name: "No trousers", item_ids: [top.id, shoes.id], score: 95 },
      ],
    });

    const res = await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.suggestOutfits({ count: 5 });
    expect(res.suggestions).toEqual([]);
    expect(res.reason).toMatch(/couldn't find a combination/i);
  });

  dbIt("discards combinations using two items from one slot", async () => {
    const { top, bottom } = await seedWardrobe(noah);
    const secondTop = (await addItem(noah, "top", "second tee")).item!;
    mockLlmJson({
      outfits: [
        {
          name: "Two tops",
          item_ids: [top.id, secondTop.id, bottom.id],
          score: 88,
        },
      ],
    });

    const res = await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.suggestOutfits({ count: 5 });
    expect(res.suggestions).toEqual([]);
  });

  dbIt("degrades gracefully when the stylist is offline", async () => {
    await seedWardrobe(noah);
    vi.mocked(claudeJson).mockRejectedValueOnce(new Error("stylist offline"));

    const res = await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.suggestOutfits({ count: 3 });
    expect(res.suggestions).toEqual([]);
    expect(res.reason).toMatch(/temporarily unavailable/i);
  });
});

describe("wardrobe saved outfits", () => {
  dbIt("saves an outfit and hydrates its items on read", async () => {
    const { top, bottom } = await seedWardrobe(mia);
    const caller = appRouter.createCaller(ctxFor(mia));

    await caller.wardrobe.saveOutfit({
      name: "Monday basics",
      itemIds: [top.id, bottom.id],
      occasion: "office",
      source: "manual",
    });

    const outfits = await caller.wardrobe.listOutfits();
    const saved = outfits.find(o => o.name === "Monday basics");
    expect(saved).toBeDefined();
    expect(saved!.itemIds.sort()).toEqual([top.id, bottom.id].sort());
    expect(saved!.items).toHaveLength(2);
  });

  dbIt("refuses to save an outfit using someone else's clothes", async () => {
    const mine = await seedWardrobe(mia);
    const theirs = await seedWardrobe(noah);

    await expect(
      appRouter.createCaller(ctxFor(mia)).wardrobe.saveOutfit({
        name: "Not mine",
        itemIds: [mine.top.id, theirs.bottom.id],
      })
    ).rejects.toThrow(/aren't in your wardrobe/i);
  });

  dbIt("only lists the caller's own saved outfits", async () => {
    const outfits = await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.listOutfits();
    expect(outfits.every(o => o.userId === noah.id)).toBe(true);
  });
});

describe("wardrobe.postToFeed", () => {
  dbIt("publishes a saved outfit into the competition feed", async () => {
    const { top, bottom } = await seedWardrobe(mia);
    const caller = appRouter.createCaller(ctxFor(mia));
    const saved = await caller.wardrobe.saveOutfit({
      name: "Feed debut",
      itemIds: [top.id, bottom.id],
      occasion: "brunch",
      aiRationale: "Balanced proportions.",
      aiScore: 77,
      source: "ai",
    });

    const res = await caller.wardrobe.postToFeed({
      outfitId: saved.id!,
      category: "casual",
    });
    expect(res.success).toBe(true);
    expect(res.postId).toBeGreaterThan(0);

    const post = await appRouter
      .createCaller(ctxFor(null))
      .outfits.getPost({ id: res.postId! });
    expect(post).not.toBeNull();
    expect(post!.post.caption).toContain("Feed debut");
    expect(post!.post.category).toBe("casual");
    // Carries the stylist's verdict across to the feed
    expect(post!.post.aiStyleScore).toBe(77);
    expect(post!.post.aiFeedback).toBe("Balanced proportions.");
    // With no render yet, the cover falls back to the garment's tidied shot
    // rather than the user's raw phone photo.
    const cover = post!.post.imageUrl;
    expect(cover).toContain("/manus-storage/generated/");
  });

  dbIt("refuses to publish the same outfit twice", async () => {
    const { top, bottom } = await seedWardrobe(mia);
    const caller = appRouter.createCaller(ctxFor(mia));
    const saved = await caller.wardrobe.saveOutfit({
      name: "Once only",
      itemIds: [top.id, bottom.id],
    });

    await caller.wardrobe.postToFeed({ outfitId: saved.id! });
    await expect(
      caller.wardrobe.postToFeed({ outfitId: saved.id! })
    ).rejects.toThrow(/already in the feed/i);
  });

  dbIt("refuses to publish an outfit belonging to someone else", async () => {
    const { top, bottom } = await seedWardrobe(mia);
    const saved = await appRouter
      .createCaller(ctxFor(mia))
      .wardrobe.saveOutfit({ name: "Mia's", itemIds: [top.id, bottom.id] });

    await expect(
      appRouter
        .createCaller(ctxFor(noah))
        .wardrobe.postToFeed({ outfitId: saved.id! })
    ).rejects.toThrow(/not yours/i);
  });
});

describe("wardrobe.comments", () => {
  async function aPost() {
    const { top, bottom } = await seedWardrobe(mia);
    const caller = appRouter.createCaller(ctxFor(mia));
    const saved = await caller.wardrobe.saveOutfit({
      name: "Commentable",
      itemIds: [top.id, bottom.id],
    });
    const { postId } = await caller.wardrobe.postToFeed({
      outfitId: saved.id!,
    });
    return postId!;
  }

  dbIt("adds and lists comments newest-first", async () => {
    const postId = await aPost();
    await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.comments.add({ postId, body: "Love the colour pairing" });

    const comments = await appRouter
      .createCaller(ctxFor(null))
      .wardrobe.comments.list({ postId });
    expect(comments).toHaveLength(1);
    expect(comments[0].comment.body).toBe("Love the colour pairing");
    expect(comments[0].authorName).toBe("Noah");
  });

  dbIt("requires sign-in to comment", async () => {
    const postId = await aPost();
    await expect(
      appRouter
        .createCaller(ctxFor(null))
        .wardrobe.comments.add({ postId, body: "hi" })
    ).rejects.toThrow();
  });

  dbIt("rejects empty or oversized comments", async () => {
    const postId = await aPost();
    const caller = appRouter.createCaller(ctxFor(noah));
    await expect(
      caller.wardrobe.comments.add({ postId, body: "   " })
    ).rejects.toThrow();
    await expect(
      caller.wardrobe.comments.add({ postId, body: "x".repeat(501) })
    ).rejects.toThrow();
  });

  dbIt("rejects a comment on a post that doesn't exist", async () => {
    await expect(
      appRouter
        .createCaller(ctxFor(noah))
        .wardrobe.comments.add({ postId: 987654, body: "ghost" })
    ).rejects.toThrow(/not found/i);
  });

  dbIt("only lets the author delete their own comment", async () => {
    const postId = await aPost();
    await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.comments.add({ postId, body: "mine" });
    const [posted] = await appRouter
      .createCaller(ctxFor(null))
      .wardrobe.comments.list({ postId });

    // Someone else's delete is a no-op...
    await appRouter
      .createCaller(ctxFor(mia))
      .wardrobe.comments.delete({ id: posted.comment.id });
    expect(
      await appRouter
        .createCaller(ctxFor(null))
        .wardrobe.comments.list({ postId })
    ).toHaveLength(1);

    // ...but the author can remove it.
    await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.comments.delete({ id: posted.comment.id });
    expect(
      await appRouter
        .createCaller(ctxFor(null))
        .wardrobe.comments.list({ postId })
    ).toHaveLength(0);
  });
});

describe("outfits.outfitOfTheWeek", () => {
  dbIt("returns nothing until an outfit has won a battle", async () => {
    const crown = await appRouter
      .createCaller(ctxFor(null))
      .outfits.outfitOfTheWeek();
    expect(crown).toBeNull();
  });

  dbIt("crowns the highest-Elo outfit that has won a battle", async () => {
    // Two posts from different owners so a third party can judge them.
    const m = await seedWardrobe(mia);
    const n = await seedWardrobe(noah);
    const miaCaller = appRouter.createCaller(ctxFor(mia));
    const noahCaller = appRouter.createCaller(ctxFor(noah));

    const miaOutfit = await miaCaller.wardrobe.saveOutfit({
      name: "Mia contender",
      itemIds: [m.top.id, m.bottom.id],
    });
    const noahOutfit = await noahCaller.wardrobe.saveOutfit({
      name: "Noah contender",
      itemIds: [n.top.id, n.bottom.id],
    });
    const miaPost = await miaCaller.wardrobe.postToFeed({
      outfitId: miaOutfit.id!,
    });
    const noahPost = await noahCaller.wardrobe.postToFeed({
      outfitId: noahOutfit.id!,
    });

    await db.upsertUser({
      openId: "wd-judge",
      name: "Judge",
      email: "judge@test.dev",
    });
    const judge = (await db.getUserByOpenId("wd-judge"))!;

    await appRouter.createCaller(ctxFor(judge)).outfits.battle.vote({
      postAId: miaPost.postId!,
      postBId: noahPost.postId!,
      winnerId: miaPost.postId!,
    });

    const crown = await appRouter
      .createCaller(ctxFor(null))
      .outfits.outfitOfTheWeek();
    expect(crown).not.toBeNull();
    expect(crown!.post.id).toBe(miaPost.postId);
    expect(crown!.post.battleWins).toBeGreaterThan(0);
    expect(crown!.authorName).toBe("Mia");
  });
});

describe("garment clean-up shots", () => {
  dbIt(
    "stores a tidied product shot alongside the original photo",
    async () => {
      vi.mocked(generateImage).mockResolvedValueOnce({
        url: "/manus-storage/generated/clean-1.png",
      });
      mockLlmJson({
        name: "linen shirt",
        slot: "top",
        colour: "white",
        tags: [],
      });

      const res = await appRouter.createCaller(ctxFor(mia)).wardrobe.addItem({
        fileBase64: TINY_PNG_BASE64,
        mimeType: "image/png",
      });

      // The user's original upload is never discarded.
      expect(res.item?.imageUrl).toContain("/manus-storage/wardrobe/");
      expect(res.item?.cleanImageUrl).toBe(
        "/manus-storage/generated/clean-1.png"
      );
      expect(res.item?.cleanImageKey).toBe("generated/clean-1.png");
    }
  );

  dbIt("keeps the item when the image service fails", async () => {
    vi.mocked(generateImage).mockRejectedValueOnce(new Error("image svc down"));
    mockLlmJson({
      name: "denim jacket",
      slot: "outerwear",
      colour: "blue",
      tags: [],
    });

    const res = await appRouter.createCaller(ctxFor(mia)).wardrobe.addItem({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
    });

    expect(res.success).toBe(true);
    expect(res.item?.name).toBe("denim jacket");
    expect(res.item?.cleanImageUrl).toBeNull();
  });

  dbIt("shows the tidied shot in suggestions when there is one", async () => {
    const { top, bottom } = await seedWardrobe(noah);
    mockLlmJson({
      outfits: [
        { name: "Clean look", item_ids: [top.id, bottom.id], score: 75 },
      ],
    });
    const res = await appRouter
      .createCaller(ctxFor(noah))
      .wardrobe.suggestOutfits({ count: 1 });

    // seedWardrobe runs through addItem, so each garment has a mocked clean shot.
    expect(res.suggestions[0].items[0].imageUrl).toContain(
      "/manus-storage/generated/"
    );
  });
});

describe("wardrobe.renderOutfit", () => {
  async function savedOutfit(user: User) {
    const { top, bottom } = await seedWardrobe(user);
    const res = await appRouter.createCaller(ctxFor(user)).wardrobe.saveOutfit({
      name: "Render me",
      itemIds: [top.id, bottom.id],
      occasion: "brunch",
    });
    return res.id!;
  }

  dbIt("renders the outfit on a mannequin by default", async () => {
    const id = await savedOutfit(mia);
    vi.mocked(generateImage).mockResolvedValueOnce({
      url: "/manus-storage/generated/render-1.png",
    });

    const res = await appRouter
      .createCaller(ctxFor(mia))
      .wardrobe.renderOutfit({ outfitId: id });

    expect(res.style).toBe("mannequin");
    expect(res.renderImageUrl).toBe("/manus-storage/generated/render-1.png");

    const outfits = await appRouter
      .createCaller(ctxFor(mia))
      .wardrobe.listOutfits();
    const saved = outfits.find(o => o.id === id);
    expect(saved!.renderImageUrl).toBe("/manus-storage/generated/render-1.png");
    expect(saved!.renderStyle).toBe("mannequin");
  });

  dbIt(
    "refuses a personal render before a photo has been supplied",
    async () => {
      const id = await savedOutfit(mia);
      await expect(
        appRouter
          .createCaller(ctxFor(mia))
          .wardrobe.renderOutfit({ outfitId: id, style: "personal" })
      ).rejects.toThrow(/photo of yourself/i);
    }
  );

  dbIt("renders on the user's own photo once they have added one", async () => {
    const caller = appRouter.createCaller(ctxFor(mia));
    await caller.wardrobe.model.upload({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
      isPhotoOfMe: true,
    });
    const id = await savedOutfit(mia);
    vi.mocked(generateImage).mockResolvedValueOnce({
      url: "/manus-storage/generated/render-personal.png",
    });

    const res = await caller.wardrobe.renderOutfit({
      outfitId: id,
      style: "personal",
    });
    expect(res.style).toBe("personal");

    // The person's photo is passed first so the model renders them, not a stranger.
    const call = vi.mocked(generateImage).mock.calls.at(-1)![0];
    expect(call.originalImages![0].url).toContain(
      "/manus-storage/wardrobe-model/"
    );
    expect(call.prompt).toMatch(/same person/i);
  });

  dbIt("refuses to render someone else's outfit", async () => {
    const id = await savedOutfit(mia);
    await expect(
      appRouter
        .createCaller(ctxFor(noah))
        .wardrobe.renderOutfit({ outfitId: id })
    ).rejects.toThrow(/not yours/i);
  });

  dbIt(
    "reports a clear error when the image service is unavailable",
    async () => {
      const id = await savedOutfit(mia);
      vi.mocked(generateImage).mockRejectedValueOnce(
        new Error("image svc down")
      );
      await expect(
        appRouter
          .createCaller(ctxFor(mia))
          .wardrobe.renderOutfit({ outfitId: id })
      ).rejects.toThrow(/try again/i);
    }
  );

  dbIt("uses the render as the feed cover once one exists", async () => {
    const id = await savedOutfit(mia);
    vi.mocked(generateImage).mockResolvedValueOnce({
      url: "/manus-storage/generated/cover.png",
    });
    const caller = appRouter.createCaller(ctxFor(mia));
    await caller.wardrobe.renderOutfit({ outfitId: id });

    const { postId } = await caller.wardrobe.postToFeed({ outfitId: id });
    const post = await appRouter
      .createCaller(ctxFor(null))
      .outfits.getPost({ id: postId! });
    expect(post!.post.imageUrl).toBe("/manus-storage/generated/cover.png");
  });
});

describe("wardrobe.model", () => {
  dbIt("stores the photo with a consent timestamp", async () => {
    const caller = appRouter.createCaller(ctxFor(noah));
    await caller.wardrobe.model.upload({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
      isPhotoOfMe: true,
    });

    const model = await caller.wardrobe.model.get();
    expect(model).not.toBeNull();
    expect(model!.imageUrl).toContain("/manus-storage/wardrobe-model/");
    expect(model!.consentedAt).toBeInstanceOf(Date);
  });

  dbIt("rejects an upload without the confirmation", async () => {
    await expect(
      appRouter.createCaller(ctxFor(noah)).wardrobe.model.upload({
        fileBase64: TINY_PNG_BASE64,
        mimeType: "image/png",
        isPhotoOfMe: false as never,
      })
    ).rejects.toThrow();
  });

  dbIt("replaces rather than duplicates on a second upload", async () => {
    const caller = appRouter.createCaller(ctxFor(noah));
    await caller.wardrobe.model.upload({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
      isPhotoOfMe: true,
    });
    await caller.wardrobe.model.upload({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
      isPhotoOfMe: true,
    });

    const conn = await getDb();
    const rows = await conn!.select().from(wardrobeModels);
    expect(rows.filter(r => r.userId === noah.id)).toHaveLength(1);
  });

  dbIt("lets the user remove their photo", async () => {
    const caller = appRouter.createCaller(ctxFor(noah));
    await caller.wardrobe.model.upload({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
      isPhotoOfMe: true,
    });
    await caller.wardrobe.model.delete();
    expect(await caller.wardrobe.model.get()).toBeNull();
  });

  dbIt("keeps each user's photo private to them", async () => {
    await appRouter.createCaller(ctxFor(mia)).wardrobe.model.upload({
      fileBase64: TINY_PNG_BASE64,
      mimeType: "image/png",
      isPhotoOfMe: true,
    });
    await appRouter.createCaller(ctxFor(noah)).wardrobe.model.delete();

    // Deleting Noah's photo must not touch Mia's.
    expect(
      await appRouter.createCaller(ctxFor(mia)).wardrobe.model.get()
    ).not.toBeNull();
  });
});

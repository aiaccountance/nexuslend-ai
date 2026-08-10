/**
 * Image generation for Outfit Arena.
 *
 * Two jobs: tidying a raw phone photo of a garment into a clean product shot,
 * and rendering a saved outfit as it would look worn.
 *
 * Every function here is best-effort. Image generation is slow, paid and
 * occasionally fails, and none of it is essential to the underlying record —
 * a garment without a clean shot still shows its original photo. So failures
 * return null and the caller carries on.
 *
 * NOTE: this is the one part of Outfit Arena that does not run on Claude.
 * Claude reads images but cannot draw them, so the prompts below go to a
 * separate image-generation service (`_core/imageGeneration`). Swapping in a
 * different provider means changing that module and nothing else — the prompts
 * and the calling code here are provider-agnostic.
 */
import { generateImage } from "./_core/imageGeneration";

const CLEAN_SHOT_PROMPT = `
Restage this exact garment as a clean e-commerce product photo.

Keep the garment itself completely unchanged — same colour, pattern, fabric, cut and proportions. Do not restyle, recolour or redesign it.

Replace the surroundings: remove the original background, clutter, hands, hangers and harsh phone-camera lighting. Place the garment centred on a soft, subtly graduated neutral studio backdrop in a very light warm grey, with even diffused lighting and a soft natural shadow beneath it.

Square framing, generous margin around the garment, no text, no watermarks, no props.
`.trim();

export type OutfitRenderStyle = "mannequin" | "personal";

type GarmentForRender = {
  name: string;
  slot: string;
  colour: string | null;
  imageUrl: string;
  cleanImageUrl: string | null;
};

/**
 * Tidies a raw garment photo into a product shot on a neutral backdrop.
 * Returns null if generation is unavailable or fails.
 */
export async function generateCleanGarmentShot(
  fileBase64: string,
  mimeType: string
): Promise<{ url: string } | null> {
  try {
    const { url } = await generateImage({
      prompt: CLEAN_SHOT_PROMPT,
      originalImages: [{ b64Json: fileBase64, mimeType }],
    });
    return url ? { url } : null;
  } catch (err) {
    console.error("[Wardrobe] Clean garment shot failed:", err);
    return null;
  }
}

function describeGarments(items: GarmentForRender[]): string {
  return items
    .map(i => `- ${i.slot}: ${i.name}${i.colour ? ` (${i.colour})` : ""}`)
    .join("\n");
}

/**
 * Renders an outfit as it would look worn — on a neutral mannequin, or on the
 * user's own photo when they have supplied and consented to one.
 *
 * The garment images are passed as references so the generated look reflects
 * the actual clothes rather than a generic interpretation of the text.
 */
export async function generateOutfitRender(opts: {
  items: GarmentForRender[];
  style: OutfitRenderStyle;
  occasion?: string | null;
  /** The user's own photo. Required for the personal style. */
  modelImageUrl?: string | null;
}): Promise<{ url: string } | null> {
  const { items, style, occasion, modelImageUrl } = opts;
  if (items.length === 0) return null;
  if (style === "personal" && !modelImageUrl) return null;

  const garmentList = describeGarments(items);
  const occasionLine = occasion ? `\nStyled for: ${occasion}.` : "";

  const prompt =
    style === "personal"
      ? `
The first image is a photo of the person this outfit is for. Every image after it is a garment they own.

Show this same person wearing the complete outfit below. Keep their face, hair, skin tone and body proportions faithful to their photo — this is them trying on their own clothes, not a different model.

The outfit:
${garmentList}${occasionLine}

Reproduce each garment accurately from its reference image — same colour, pattern and cut. Full-length view, natural relaxed standing pose, soft even studio lighting, plain softly graduated neutral backdrop. Photographic and realistic. No text or watermarks.
`.trim()
      : `
Each image is a garment from a single outfit.

Show the complete outfit below worn together on a plain, faceless, neutral-grey display mannequin. No head, no face, no visible skin — a shop-window mannequin form only.

The outfit:
${garmentList}${occasionLine}

Reproduce each garment accurately from its reference image — same colour, pattern and cut. Full-length view, soft even studio lighting, plain softly graduated neutral backdrop, soft shadow on the floor. Clean and editorial. No text or watermarks.
`.trim();

  // Prefer the tidied product shots as references; they carry less noise.
  const garmentRefs = items.map(i => ({
    url: i.cleanImageUrl ?? i.imageUrl,
  }));

  const originalImages =
    style === "personal"
      ? [{ url: modelImageUrl as string }, ...garmentRefs]
      : garmentRefs;

  try {
    const { url } = await generateImage({ prompt, originalImages });
    return url ? { url } : null;
  } catch (err) {
    console.error("[Wardrobe] Outfit render failed:", err);
    return null;
  }
}

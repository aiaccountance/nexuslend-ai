/**
 * Claude client for Outfit Arena.
 *
 * Every piece of language and vision work in Outfit Arena — judging an outfit
 * photo, cataloguing a garment, proposing outfits from a wardrobe — goes
 * through here, using the official Anthropic SDK.
 *
 * The one thing Claude cannot do is *make* an image, so the clean product
 * shots and worn-outfit renders in `server/wardrobeImages.ts` still call out
 * to a separate image-generation service.
 *
 * Callers get either a parsed, schema-shaped object or a thrown error. Nothing
 * here retries or degrades — the routers own that decision, because what a
 * sensible fallback looks like depends entirely on what the user was doing.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";

/**
 * The model for work where the quality of the judgement is the product — a
 * stylist's read on an outfit, which is the thing someone came for.
 */
export const CLAUDE_MODEL = "claude-opus-5";

/**
 * The model for routine labelling: what garment is this, what colour is it.
 * There is a right answer and it is visible in the photo, so the cheaper
 * model gets it right and costs a fifth as much. At a few pence a head that
 * difference is nothing; across a wardrobe each, it is most of the bill.
 */
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5";

/** The media types the Messages API accepts for image blocks. */
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  cachedClient ??= new Anthropic({ apiKey: ENV.anthropicApiKey });
  return cachedClient;
}

/** True when Claude is configured — lets callers skip work they can't do. */
export function isClaudeConfigured(): boolean {
  return Boolean(ENV.anthropicApiKey);
}

/**
 * Turns a `data:` URI or an ordinary http(s) URL into an image content block.
 *
 * Uploads reach us as data URIs; stored garment photos as URLs. Anything with
 * an unrecognised media type is sent as JPEG rather than rejected — browsers
 * mislabel camera-roll photos often enough that guessing beats failing.
 */
function toImageBlock(source: string): Anthropic.ImageBlockParam {
  const dataUri = source.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!dataUri) {
    return { type: "image", source: { type: "url", url: source } };
  }

  const [, declaredType, isBase64, payload] = dataUri;
  if (!isBase64) {
    throw new Error("Only base64-encoded data URIs are supported for images");
  }

  const mediaType = SUPPORTED_IMAGE_TYPES.includes(
    declaredType as SupportedImageType
  )
    ? (declaredType as SupportedImageType)
    : "image/jpeg";

  return {
    type: "image",
    source: { type: "base64", media_type: mediaType, data: payload },
  };
}

/**
 * Pulls the model's answer out of a response, ignoring thinking blocks.
 * A refusal is surfaced as an error so it never lands in the database as
 * though it were an analysis.
 */
function textOf(message: Anthropic.Message): string {
  if (message.stop_reason === "refusal") {
    throw new Error("Claude declined to respond to this request");
  }
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map(block => block.text)
    .join("")
    .trim();
}

/**
 * Structured outputs make well-formed JSON the norm, but a truncated response
 * or a model that wraps its answer in prose still has to be survivable, so
 * fall back to the first balanced-looking object in the text.
 */
function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const fenced = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
    const match = fenced.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Claude returned no parseable JSON");
    return JSON.parse(match[0]) as T;
  }
}

export type ClaudeJsonRequest = {
  /** Instructions and role — the system prompt. */
  system: string;
  /** The user turn's text. */
  text: string;
  /** Data URIs or URLs, shown to Claude in order, before the text. */
  images?: string[];
  /** JSON Schema the answer must satisfy. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  /**
   * How hard Claude works on the answer. Leave at "low" for lookup-style
   * tasks; raise it where the quality of the judgement is the product.
   */
  effort?: "low" | "medium" | "high";
  /** Extended thinking. Off by default — most of these calls are quick. */
  thinking?: boolean;
  /** Defaults to `CLAUDE_MODEL`; pass `CLAUDE_FAST_MODEL` for routine work. */
  model?: string;
};

/**
 * Asks Claude for a single JSON answer matching `schema`.
 *
 * Streams under the hood: image inputs plus extended thinking can push a
 * request past the non-streaming timeout, and the SDK reassembles the message
 * for us anyway.
 */
export async function claudeJson<T>(request: ClaudeJsonRequest): Promise<T> {
  const {
    system,
    text,
    images = [],
    schema,
    maxTokens = 2048,
    effort = "low",
    thinking = false,
    model = CLAUDE_MODEL,
  } = request;

  const content: Anthropic.ContentBlockParam[] = [
    ...images.map(toImageBlock),
    { type: "text", text },
  ];

  const message = await getClient()
    .messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
      thinking: thinking ? { type: "adaptive" } : { type: "disabled" },
      output_config: {
        effort,
        format: { type: "json_schema", schema },
      },
    })
    .finalMessage();

  return parseJson<T>(textOf(message));
}

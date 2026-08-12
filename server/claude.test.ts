import { describe, expect, it, vi, beforeEach } from "vitest";

// ENV snapshots process.env at import time, so the key has to be in place
// before the module graph loads.
const { streamMock } = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  return { streamMock: vi.fn() };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: streamMock };
  },
}));

import { claudeJson, CLAUDE_MODEL } from "./_core/claude";

type Block = { type: string; text?: string };

/** Queue the next reply as a finished message with these content blocks. */
function replyWith(blocks: Block[], stopReason = "end_turn") {
  streamMock.mockReturnValueOnce({
    finalMessage: async () => ({ content: blocks, stop_reason: stopReason }),
  });
}

const SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function lastRequest() {
  return streamMock.mock.calls.at(-1)![0];
}

beforeEach(() => {
  streamMock.mockReset();
});

describe("claudeJson", () => {
  it("sends the prompt to Claude and parses the JSON answer", async () => {
    replyWith([{ type: "text", text: '{"ok":true}' }]);

    const result = await claudeJson<{ ok: boolean }>({
      system: "be helpful",
      text: "is this fine?",
      schema: SCHEMA,
    });

    expect(result).toEqual({ ok: true });

    const req = lastRequest();
    expect(req.model).toBe(CLAUDE_MODEL);
    expect(req.system).toBe("be helpful");
    expect(req.output_config.format).toEqual({
      type: "json_schema",
      schema: SCHEMA,
    });
  });

  it("ignores thinking blocks when reading the answer", async () => {
    replyWith([
      { type: "thinking", text: 'hmm, {"ok":false} maybe' },
      { type: "text", text: '{"ok":true}' },
    ]);

    expect(
      await claudeJson({ system: "s", text: "t", schema: SCHEMA })
    ).toEqual({ ok: true });
  });

  it("recovers JSON wrapped in prose or a markdown fence", async () => {
    replyWith([
      { type: "text", text: 'Here you go:\n```json\n{"ok":true}\n```' },
    ]);

    expect(
      await claudeJson({ system: "s", text: "t", schema: SCHEMA })
    ).toEqual({ ok: true });
  });

  it("throws rather than inventing an answer when there is no JSON", async () => {
    replyWith([{ type: "text", text: "I could not do that" }]);

    await expect(
      claudeJson({ system: "s", text: "t", schema: SCHEMA })
    ).rejects.toThrow(/no parseable JSON/);
  });

  it("surfaces a refusal as an error instead of parsing it", async () => {
    replyWith([{ type: "text", text: '{"ok":true}' }], "refusal");

    await expect(
      claudeJson({ system: "s", text: "t", schema: SCHEMA })
    ).rejects.toThrow(/declined/);
  });

  it("sends a base64 data URI as an inline image block", async () => {
    replyWith([{ type: "text", text: '{"ok":true}' }]);

    await claudeJson({
      system: "s",
      text: "what is this?",
      images: [`data:image/png;base64,${TINY_PNG}`],
      schema: SCHEMA,
    });

    const [image, text] = lastRequest().messages[0].content;
    expect(image).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: TINY_PNG },
    });
    expect(text).toEqual({ type: "text", text: "what is this?" });
  });

  it("falls back to JPEG for a media type the API does not accept", async () => {
    replyWith([{ type: "text", text: '{"ok":true}' }]);

    await claudeJson({
      system: "s",
      text: "t",
      images: [`data:image/heic;base64,${TINY_PNG}`],
      schema: SCHEMA,
    });

    expect(lastRequest().messages[0].content[0].source.media_type).toBe(
      "image/jpeg"
    );
  });

  it("passes an ordinary URL through as a url image block", async () => {
    replyWith([{ type: "text", text: '{"ok":true}' }]);

    await claudeJson({
      system: "s",
      text: "t",
      images: ["https://example.test/coat.jpg"],
      schema: SCHEMA,
    });

    expect(lastRequest().messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "url", url: "https://example.test/coat.jpg" },
    });
  });

  it("leaves thinking off unless the caller asks for it", async () => {
    replyWith([{ type: "text", text: '{"ok":true}' }]);
    await claudeJson({ system: "s", text: "t", schema: SCHEMA });
    expect(lastRequest().thinking).toEqual({ type: "disabled" });

    replyWith([{ type: "text", text: '{"ok":true}' }]);
    await claudeJson({
      system: "s",
      text: "t",
      schema: SCHEMA,
      thinking: true,
      effort: "medium",
    });
    expect(lastRequest().thinking).toEqual({ type: "adaptive" });
    expect(lastRequest().output_config.effort).toBe("medium");
  });
});

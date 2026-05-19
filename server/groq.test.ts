import { describe, it, expect } from "vitest";

describe("Groq API key validation", () => {
  it("should successfully call Groq API with the configured key", async () => {
    const apiKey = process.env.GROQ_API_KEY;
    expect(apiKey, "GROQ_API_KEY must be set").toBeTruthy();
    expect(apiKey?.startsWith("gsk_"), "GROQ_API_KEY must start with gsk_").toBe(true);

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: "Reply with the single word: OK" }],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    expect(res.status, `Groq API returned ${res.status}`).toBe(200);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const content = data?.choices?.[0]?.message?.content ?? "";
    expect(content.length, "Groq API returned empty content").toBeGreaterThan(0);
    console.log("✅ Groq API response:", content.trim());
  }, 30_000);
});

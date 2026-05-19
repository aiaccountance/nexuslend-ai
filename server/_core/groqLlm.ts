/**
 * Groq LLM helper — mirrors the invokeLLM interface but calls Groq API directly.
 * Used as a drop-in replacement when the Manus built-in Forge API is unavailable.
 *
 * Model: llama-3.3-70b-versatile (free tier, 14,400 req/day, 12,000 TPM)
 * Fallback: llama-3.1-8b-instant (30,000 TPM, faster)
 */

import { ENV } from "./env";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// llama-4-scout: 30,000 TPM, 131K context window — handles our ~14K token prompt
// llama-3.3-70b: 12,000 TPM — too small for our system prompt (13,846 tokens)
// llama-3.1-8b: 6,000 TPM — too small
const PRIMARY_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const FALLBACK_MODEL = "llama-3.3-70b-versatile";

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqOptions {
  messages: GroqMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" } | { type: "text" };
  model?: string;
}

export async function invokeGroq(options: GroqOptions): Promise<{ choices: Array<{ message: { content: string } }> }> {
  const apiKey = ENV.groqApiKey;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured. Please add it in project secrets.");
  }

  const model = options.model ?? PRIMARY_MODEL;

  const body = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.max_tokens ?? 2000,
    ...(options.response_format ? { response_format: options.response_format } : {}),
  };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // If rate limited (429) on primary model, retry with faster fallback
    if (res.status === 429 && model === PRIMARY_MODEL) {
      console.warn("[Groq] Rate limited on 70B, retrying with 8B fallback...");
      return invokeGroq({ ...options, model: FALLBACK_MODEL });
    }
    // If request too large (413) on 8B fallback, surface a clear error
    if (res.status === 413) {
      throw new Error(`Groq API error 413: Request too large. The system prompt exceeds the model's token limit. Please reduce the prompt size or upgrade the Groq plan.`);
    }
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data;
}

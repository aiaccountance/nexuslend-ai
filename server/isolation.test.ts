import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * Outfit Arena and the lending product share a codebase, a database and a
 * users table — and nothing else. These tests make that a rule rather than a
 * habit: if someone later wires the fashion app to a bank-data API, or points
 * it at the lending product's AI, the suite fails and says why.
 */

const SERVER = path.join(__dirname);

/** Every file that makes up Outfit Arena on the server. */
const OUTFIT_ARENA_FILES = [
  "outfitsRouter.ts",
  "outfitsDb.ts",
  "wardrobeRouter.ts",
  "wardrobeDb.ts",
  "wardrobeImages.ts",
  "accountsRouter.ts",
  "accountsDb.ts",
  "password.ts",
  "_core/claude.ts",
];

/**
 * Services that exist for lending and must never be reachable from the fashion
 * app. TrueLayer reads people's bank accounts; Companies House and Land
 * Registry answer questions about businesses and property. None of them can
 * say anything useful about an outfit, and all of them are billed separately.
 */
const LENDING_ONLY = [
  { name: "TrueLayer (bank account data)", pattern: /truelayer/i },
  { name: "Groq (the lending product's model)", pattern: /groq/i },
  { name: "Companies House", pattern: /companies.?house/i },
  { name: "Land Registry", pattern: /land.?registry/i },
  { name: "Resend (lending email)", pattern: /resend/i },
  { name: "the shared forge LLM helper", pattern: /invokeLLM/ },
];

function readArenaFile(relative: string) {
  return readFileSync(path.join(SERVER, relative), "utf8");
}

describe("Outfit Arena is isolated from the lending product", () => {
  it.each(OUTFIT_ARENA_FILES)("%s calls no lending-only service", file => {
    const source = readArenaFile(file);
    const found = LENDING_ONLY.filter(service =>
      service.pattern.test(source)
    ).map(service => service.name);

    expect(
      found,
      `${file} references ${found.join(", ")}. Outfit Arena must not reach ` +
        `lending services — they answer questions about businesses and bank ` +
        `accounts, not clothes, and they are billed separately.`
    ).toEqual([]);
  });

  it.each(OUTFIT_ARENA_FILES)("%s imports no lending module", file => {
    const source = readArenaFile(file);
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
      m => m[1]
    );
    const lendingModules = imports.filter(specifier =>
      /groqLlm|analyser|truelayer|companiesHouse|landRegistry|email/i.test(
        specifier
      )
    );
    expect(lendingModules).toEqual([]);
  });

  it("the AI client talks only to Anthropic", () => {
    const source = readArenaFile("_core/claude.ts");
    // Any other provider's endpoint appearing here would mean outfit photos
    // were being sent somewhere nobody agreed to.
    expect(source).not.toMatch(/openai|groq|gemini|forge\.manus|mistral/i);
    expect(source).toMatch(/@anthropic-ai\/sdk/);
  });

  it("Outfit Arena's AI key can be set separately from the lending keys", async () => {
    const envSource = readFileSync(path.join(SERVER, "_core/env.ts"), "utf8");
    // A dedicated variable means the fashion app's key can be rotated or
    // revoked without touching anything the lending product depends on.
    expect(envSource).toMatch(/OUTFIT_ARENA_ANTHROPIC_API_KEY/);
  });

  it("no lending page imports an Outfit Arena module", () => {
    // The isolation has to hold in both directions, or removing the fashion
    // app later would break the lending dashboard.
    const lendingDir = path.join(__dirname, "../client/src/pages/dashboard");
    let offenders: string[] = [];
    try {
      for (const entry of readdirSync(lendingDir)) {
        if (!entry.endsWith(".tsx")) continue;
        const source = readFileSync(path.join(lendingDir, entry), "utf8");
        if (/pages\/outfits/.test(source)) offenders.push(entry);
      }
    } catch {
      // No dashboard directory in this checkout — nothing to enforce.
    }
    expect(offenders).toEqual([]);
  });
});

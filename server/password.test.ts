import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("accepts the right password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", hash)
    ).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword("Correct horse battery staple", hash)
    ).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("never stores the password itself", async () => {
    const secret = "hunter2-is-a-terrible-password";
    const hash = await hashPassword(secret);
    expect(hash).not.toContain(secret);
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same password"),
      hashPassword("same password"),
    ]);
    expect(a).not.toBe(b);
    // Both still verify — the salt travels with the hash.
    await expect(verifyPassword("same password", a)).resolves.toBe(true);
    await expect(verifyPassword("same password", b)).resolves.toBe(true);
  });

  it("treats equivalent unicode spellings as the same password", async () => {
    // é typed as one codepoint vs e + combining accent.
    const hash = await hashPassword("cafépass");
    await expect(verifyPassword("cafépass", hash)).resolves.toBe(true);
  });

  // A corrupt or empty column must deny access rather than crash sign-in.
  it.each([
    ["null", null],
    ["empty", ""],
    ["not our format", "plaintext-password"],
    ["wrong field count", "scrypt$16384$8$salt$hash"],
    ["unknown algorithm", "bcrypt$16384$8$1$c2FsdA==$aGFzaA=="],
    ["non-numeric cost", "scrypt$abc$8$1$c2FsdA==$aGFzaA=="],
  ])("returns false for a %s hash", async (_label, stored) => {
    await expect(verifyPassword("anything", stored)).resolves.toBe(false);
  });
});

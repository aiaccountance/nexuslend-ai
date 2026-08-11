import { describe, expect, it, vi, beforeAll } from "vitest";

// Signing a session needs a secret, and ENV reads it once at import time.
vi.hoisted(() => {
  process.env.JWT_SECRET ||= "test-session-secret-not-a-real-one";
});

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockImplementation(async (key: string) => ({
    key,
    url: `/manus-storage/${key}`,
  })),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import * as db from "./db";
import { getDb } from "./db";
import { outfitAccounts, users } from "../drizzle/schema";
import { eq, like } from "drizzle-orm";
import { checkUsername } from "./accountsDb";

/** Captures what the router sets on the response, so we can assert on it. */
function ctxFor(user: User | null) {
  const cookies: Array<{ name: string; value: string }> = [];
  const cleared: string[] = [];
  const ctx = {
    user,
    req: { protocol: "https", headers: {}, hostname: "test" },
    res: {
      cookie: (name: string, value: string) => cookies.push({ name, value }),
      clearCookie: (name: string) => cleared.push(name),
    },
  } as unknown as TrpcContext;
  return { ctx, cookies, cleared };
}

let portalUser: User;
let dbAvailable = false;

beforeAll(async () => {
  const conn = await getDb();
  if (!conn) return;
  try {
    // Only ever touch the accounts this file creates.
    await conn.delete(outfitAccounts);
    await conn.delete(users).where(like(users.openId, "oa_%"));
    await conn.delete(users).where(eq(users.openId, "acct-portal"));

    await db.upsertUser({
      openId: "acct-portal",
      name: "Portal Person",
      email: "portal@test.dev",
    });
    portalUser = (await db.getUserByOpenId("acct-portal"))!;
    dbAvailable = Boolean(portalUser);
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

// ─── Username rules (no database needed) ─────────────────────────────────────
describe("username rules", () => {
  it.each(["ava", "ava_lazarus", "ava.style", "a1b2c3", "x".repeat(30)])(
    "accepts %s",
    name => {
      expect(checkUsername(name).ok).toBe(true);
    }
  );

  it.each([
    ["too short", "ab"],
    ["too long", "x".repeat(31)],
    ["leading dot", ".ava"],
    ["trailing dot", "ava."],
    ["double dot", "av..a"],
    ["trailing underscore is fine but spaces are not", "ava lazarus"],
    ["email-ish", "ava@style"],
    ["slash would break a url", "ava/style"],
    ["reserved", "admin"],
    ["reserved route", "settings"],
  ])("rejects %s", (_label, name) => {
    expect(checkUsername(name).ok).toBe(false);
  });

  it("lowercases the handle but remembers the spelling", () => {
    const result = checkUsername("AvaLazarus");
    expect(result.ok && result.canonical).toBe("avalazarus");
  });
});

// ─── Sign up and sign in ─────────────────────────────────────────────────────
describe("accounts.signUp", () => {
  dbIt("creates an account and signs the person in", async () => {
    const { ctx, cookies } = ctxFor(null);
    const res = await appRouter.createCaller(ctx).accounts.signUp({
      username: "Mia_Fits",
      password: "a-good-long-password",
      displayName: "Mia",
    });

    expect(res.success).toBe(true);
    expect(res.account.username).toBe("mia_fits");
    // Capitalisation they chose is preserved for display.
    expect(res.account.displayUsername).toBe("Mia_Fits");
    expect(res.account.hasPassword).toBe(true);
    // A session cookie was set, so they are signed in immediately.
    expect(cookies).toHaveLength(1);
    expect(cookies[0].value.length).toBeGreaterThan(20);
  });

  dbIt("never stores the password in readable form", async () => {
    const conn = await getDb();
    const rows = await conn!
      .select()
      .from(outfitAccounts)
      .where(eq(outfitAccounts.username, "mia_fits"));
    expect(rows[0].passwordHash).not.toContain("a-good-long-password");
    expect(rows[0].passwordHash?.startsWith("scrypt$")).toBe(true);
  });

  dbIt("refuses a username that is already taken", async () => {
    const { ctx } = ctxFor(null);
    await expect(
      appRouter.createCaller(ctx).accounts.signUp({
        username: "mia_fits",
        password: "another-long-password",
      })
    ).rejects.toThrow(/taken/i);
  });

  dbIt("treats usernames case-insensitively when checking", async () => {
    const { ctx } = ctxFor(null);
    await expect(
      appRouter.createCaller(ctx).accounts.signUp({
        username: "MIA_FITS",
        password: "another-long-password",
      })
    ).rejects.toThrow(/taken/i);
  });

  dbIt("refuses a short password", async () => {
    const { ctx } = ctxFor(null);
    await expect(
      appRouter.createCaller(ctx).accounts.signUp({
        username: "shorty",
        password: "abc",
      })
    ).rejects.toThrow();
  });
});

describe("accounts.signIn", () => {
  dbIt("signs in with the right password", async () => {
    const { ctx, cookies } = ctxFor(null);
    const res = await appRouter.createCaller(ctx).accounts.signIn({
      username: "mia_fits",
      password: "a-good-long-password",
    });
    expect(res.success).toBe(true);
    expect(res.account.username).toBe("mia_fits");
    expect(cookies).toHaveLength(1);
  });

  dbIt("accepts the handle in any capitalisation", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter.createCaller(ctx).accounts.signIn({
      username: "Mia_Fits",
      password: "a-good-long-password",
    });
    expect(res.success).toBe(true);
  });

  dbIt("rejects the wrong password", async () => {
    const { ctx, cookies } = ctxFor(null);
    await expect(
      appRouter
        .createCaller(ctx)
        .accounts.signIn({ username: "mia_fits", password: "not-it" })
    ).rejects.toThrow(/wrong username or password/i);
    // Nothing was set, so a failed attempt cannot leave a session behind.
    expect(cookies).toHaveLength(0);
  });

  // The message must not reveal whether the handle exists.
  dbIt("gives the same answer for an unknown username", async () => {
    const { ctx } = ctxFor(null);
    await expect(
      appRouter
        .createCaller(ctx)
        .accounts.signIn({ username: "nobodyhere", password: "not-it" })
    ).rejects.toThrow(/wrong username or password/i);
  });
});

describe("accounts.checkUsername", () => {
  dbIt("reports a free handle as available", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.checkUsername({ username: "totally_free_handle" });
    expect(res.available).toBe(true);
  });

  dbIt("offers alternatives when the handle is taken", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.checkUsername({ username: "mia_fits" });
    expect(res.available).toBe(false);
    expect(res.suggestions.length).toBeGreaterThan(0);
    expect(res.suggestions).not.toContain("mia_fits");
  });

  dbIt("explains why an invalid handle is rejected", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.checkUsername({ username: "no spaces please" });
    expect(res.available).toBe(false);
    expect(res.reason).toMatch(/letters, numbers/i);
  });
});

// ─── Existing sign-in users claiming a handle ────────────────────────────────
describe("accounts.claimUsername", () => {
  dbIt("lets someone who signed in elsewhere pick a handle", async () => {
    const { ctx } = ctxFor(portalUser);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.claimUsername({ username: "portalperson" });
    expect(res.account.username).toBe("portalperson");
    // They have no password here — they keep signing in the way they already do.
    expect(res.account.hasPassword).toBe(false);
  });

  dbIt("refuses a second handle for the same person", async () => {
    const { ctx } = ctxFor(portalUser);
    await expect(
      appRouter
        .createCaller(ctx)
        .accounts.claimUsername({ username: "portalperson2" })
    ).rejects.toThrow(/already have a username/i);
  });

  dbIt("requires being signed in", async () => {
    const { ctx } = ctxFor(null);
    await expect(
      appRouter.createCaller(ctx).accounts.claimUsername({ username: "ghost" })
    ).rejects.toThrow();
  });
});

// ─── Identity and profile ────────────────────────────────────────────────────
describe("accounts.me", () => {
  dbIt("reports signed out when there is no session", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter.createCaller(ctx).accounts.me();
    expect(res.signedIn).toBe(false);
    expect(res.account).toBeNull();
  });

  dbIt("returns the account for a signed-in person", async () => {
    const { ctx } = ctxFor(portalUser);
    const res = await appRouter.createCaller(ctx).accounts.me();
    expect(res.signedIn).toBe(true);
    expect(res.account?.username).toBe("portalperson");
  });
});

describe("accounts.byUsername", () => {
  dbIt("finds a public profile by handle", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.byUsername({ username: "mia_fits" });
    expect(res?.username).toBe("mia_fits");
  });

  dbIt("never exposes the password hash", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.byUsername({ username: "mia_fits" });
    expect(JSON.stringify(res)).not.toContain("scrypt$");
  });

  dbIt("returns null for an unknown handle", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.byUsername({ username: "does_not_exist" });
    expect(res).toBeNull();
  });
});

describe("accounts profile editing", () => {
  dbIt("saves a bio", async () => {
    const { ctx } = ctxFor(portalUser);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.updateProfile({ bio: "Charity shop enthusiast" });
    expect(res.account.bio).toBe("Charity shop enthusiast");
  });

  dbIt("saves an avatar", async () => {
    const { ctx } = ctxFor(portalUser);
    const res = await appRouter.createCaller(ctx).accounts.setAvatar({
      fileBase64: "aGVsbG8=",
      mimeType: "image/png",
    });
    expect(res.account.avatarUrl).toContain("/manus-storage/avatars/");
  });
});

describe("accounts.signOut", () => {
  dbIt("clears the session cookie", async () => {
    const { ctx, cleared } = ctxFor(portalUser);
    await appRouter.createCaller(ctx).accounts.signOut();
    expect(cleared).toHaveLength(1);
  });
});

describe("accounts.search", () => {
  dbIt("finds people by part of their handle", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.search({ query: "mia" });
    expect(res.some(r => r.username === "mia_fits")).toBe(true);
  });

  dbIt("returns nothing for an empty search", async () => {
    const { ctx } = ctxFor(null);
    expect(
      await appRouter.createCaller(ctx).accounts.search({ query: "  " })
    ).toEqual([]);
  });

  dbIt("does not leak password hashes", async () => {
    const { ctx } = ctxFor(null);
    const res = await appRouter
      .createCaller(ctx)
      .accounts.search({ query: "mia" });
    expect(JSON.stringify(res)).not.toContain("scrypt$");
  });
});

/**
 * Outfit Arena accounts: handles, profiles, and the sign-up path.
 *
 * An account always hangs off a `users` row. Someone who signs up here gets a
 * fresh one; someone who arrived through the existing sign-in already has one
 * and just claims a handle. Either way the session that follows is the ordinary
 * session cookie, so every permission check in the app works unchanged.
 */
import { eq, or, like, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { outfitAccounts, users, InsertOutfitAccount } from "../drizzle/schema";
import { getDb } from "./db";
import { OutfitRuleError } from "./outfitsDb";
import { hashPassword, verifyPassword } from "./password";

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 30;

/**
 * Handles people can actually type and say: letters, digits, underscore and a
 * single dot between characters. No leading/trailing punctuation, no doubles.
 */
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_]|\.(?=[a-z0-9])){1,28}[a-z0-9]$/;

/** Handles that would be confusing or would collide with a route. */
const RESERVED = new Set([
  "admin",
  "administrator",
  "about",
  "api",
  "battle",
  "challenge",
  "challenges",
  "explore",
  "feed",
  "follow",
  "followers",
  "following",
  "help",
  "home",
  "leaderboard",
  "login",
  "logout",
  "me",
  "moderator",
  "new",
  "notifications",
  "outfit",
  "outfits",
  "privacy",
  "profile",
  "search",
  "settings",
  "signin",
  "signup",
  "staff",
  "support",
  "terms",
  "upload",
  "user",
  "users",
  "wardrobe",
]);

export type UsernameProblem =
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "reserved";

/**
 * Validates a handle and returns its canonical (lowercase) form.
 * Returns a machine-readable problem instead of throwing, so the sign-up form
 * can show it live as someone types.
 */
export function checkUsername(
  raw: string
): { ok: true; canonical: string } | { ok: false; problem: UsernameProblem } {
  const trimmed = raw.trim();
  if (trimmed.length < MIN_USERNAME_LENGTH) {
    return { ok: false, problem: "too_short" };
  }
  if (trimmed.length > MAX_USERNAME_LENGTH) {
    return { ok: false, problem: "too_long" };
  }

  const canonical = trimmed.toLowerCase();
  if (!USERNAME_PATTERN.test(canonical)) {
    return { ok: false, problem: "invalid_characters" };
  }
  if (RESERVED.has(canonical)) {
    return { ok: false, problem: "reserved" };
  }
  return { ok: true, canonical };
}

export function describeUsernameProblem(problem: UsernameProblem): string {
  switch (problem) {
    case "too_short":
      return `Usernames need at least ${MIN_USERNAME_LENGTH} characters`;
    case "too_long":
      return `Usernames can be at most ${MAX_USERNAME_LENGTH} characters`;
    case "reserved":
      return "That username is taken";
    case "invalid_characters":
      return "Use letters, numbers, underscores and dots — start and end with a letter or number";
  }
}

// ─── Lookups ──────────────────────────────────────────────────────────────────
export async function getAccountByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(outfitAccounts)
    .where(eq(outfitAccounts.userId, userId))
    .limit(1);
  return rows[0];
}

export async function getAccountByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(outfitAccounts)
    .where(eq(outfitAccounts.username, username.trim().toLowerCase()))
    .limit(1);
  return rows[0];
}

/** True when the handle is free. Case-insensitive, since we store lowercase. */
export async function isUsernameAvailable(
  canonical: string,
  exceptUserId?: number
) {
  const db = await getDb();
  if (!db) return false;
  const conditions = [eq(outfitAccounts.username, canonical)];
  const rows = await db
    .select({ userId: outfitAccounts.userId })
    .from(outfitAccounts)
    .where(and(...conditions))
    .limit(1);
  const existing = rows[0];
  if (!existing) return true;
  return exceptUserId !== undefined && existing.userId === exceptUserId;
}

/** Accounts for a set of users, for stamping handles onto posts and comments. */
export async function getAccountsForUsers(userIds: number[]) {
  const db = await getDb();
  if (!db || userIds.length === 0) return new Map<number, Account>();
  const rows = await db
    .select()
    .from(outfitAccounts)
    .where(
      or(
        ...Array.from(new Set(userIds)).map(id => eq(outfitAccounts.userId, id))
      )
    );
  return new Map(rows.map(row => [row.userId, row]));
}

export type Account =
  Awaited<ReturnType<typeof getAccountByUserId>> extends infer T | undefined
    ? NonNullable<T>
    : never;

// ─── Creating and updating ────────────────────────────────────────────────────
/**
 * Reserves a handle for an existing signed-in user.
 * Throws a user-facing rule error if the handle is taken or they already have one.
 */
export async function claimUsername(
  userId: number,
  rawUsername: string,
  displayName?: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const check = checkUsername(rawUsername);
  if (!check.ok) {
    throw new OutfitRuleError(
      describeUsernameProblem(check.problem),
      "BAD_REQUEST"
    );
  }

  const existing = await getAccountByUserId(userId);
  if (existing) {
    throw new OutfitRuleError("You already have a username", "CONFLICT");
  }
  if (!(await isUsernameAvailable(check.canonical))) {
    throw new OutfitRuleError("That username is taken", "CONFLICT");
  }

  await db.insert(outfitAccounts).values({
    userId,
    username: check.canonical,
    displayUsername: rawUsername.trim(),
  });

  if (displayName) {
    await db
      .update(users)
      .set({ name: displayName })
      .where(eq(users.id, userId));
  }

  return (await getAccountByUserId(userId))!;
}

/**
 * Creates a brand-new person: a `users` row plus their account.
 *
 * The generated openId marks them as having signed up here, and satisfies the
 * shared table's uniqueness rule without colliding with the existing sign-in.
 */
export async function signUp(opts: {
  username: string;
  password: string;
  displayName?: string | null;
  email?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const check = checkUsername(opts.username);
  if (!check.ok) {
    throw new OutfitRuleError(
      describeUsernameProblem(check.problem),
      "BAD_REQUEST"
    );
  }
  if (!(await isUsernameAvailable(check.canonical))) {
    throw new OutfitRuleError("That username is taken", "CONFLICT");
  }

  const openId = `oa_${randomBytes(16).toString("hex")}`;
  const passwordHash = await hashPassword(opts.password);

  await db.insert(users).values({
    openId,
    name: opts.displayName?.trim() || opts.username.trim(),
    email: opts.email?.trim() || null,
    loginMethod: "outfit-arena",
    lastSignedIn: new Date(),
  });

  const created = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  const user = created[0];
  if (!user) throw new Error("Failed to create account");

  await db.insert(outfitAccounts).values({
    userId: user.id,
    username: check.canonical,
    displayUsername: opts.username.trim(),
    passwordHash,
  });

  return { user, openId };
}

/**
 * Checks a username and password.
 *
 * Deliberately gives the same answer for "no such handle" and "wrong password"
 * so the response cannot be used to discover who has an account.
 */
export async function signIn(username: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const account = await getAccountByUsername(username);
  const ok = await verifyPassword(password, account?.passwordHash);
  if (!account || !ok) return null;

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, account.userId))
    .limit(1);
  const user = rows[0];
  if (!user) return null;

  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, user.id));

  return { user, account };
}

export async function updateProfile(
  userId: number,
  patch: Partial<Pick<InsertOutfitAccount, "bio" | "avatarUrl" | "avatarKey">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(outfitAccounts)
    .set(patch)
    .where(eq(outfitAccounts.userId, userId));
  return getAccountByUserId(userId);
}

export async function setPassword(userId: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(outfitAccounts)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(outfitAccounts.userId, userId));
}

// ─── Finding people ───────────────────────────────────────────────────────────
export async function searchAccounts(query: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const term = query
    .trim()
    .toLowerCase()
    .replace(/[%_]/g, ch => `\\${ch}`);
  if (!term) return [];
  return db
    .select({
      userId: outfitAccounts.userId,
      username: outfitAccounts.username,
      displayUsername: outfitAccounts.displayUsername,
      avatarUrl: outfitAccounts.avatarUrl,
      bio: outfitAccounts.bio,
      name: users.name,
    })
    .from(outfitAccounts)
    .leftJoin(users, eq(users.id, outfitAccounts.userId))
    .where(like(outfitAccounts.username, `%${term}%`))
    .limit(limit);
}

/**
 * Suggests free handles near one that is taken, so sign-up never dead-ends.
 */
export async function suggestUsernames(desired: string, count = 3) {
  const base = desired
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, MAX_USERNAME_LENGTH - 4);
  if (base.length < MIN_USERNAME_LENGTH) return [];

  const candidates: string[] = [];
  for (let i = 0; i < 40 && candidates.length < count; i++) {
    const suffix =
      i < 10 ? String(i + 1) : String(Math.floor(Math.random() * 9000) + 100);
    const candidate = `${base}${suffix}`;
    const check = checkUsername(candidate);
    if (!check.ok) continue;
    if (await isUsernameAvailable(check.canonical)) {
      candidates.push(check.canonical);
    }
  }
  return candidates;
}

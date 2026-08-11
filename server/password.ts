/**
 * Password hashing for Outfit Arena accounts.
 *
 * Uses scrypt from Node's own crypto module — a deliberate password KDF, not a
 * plain hash — so there is no native dependency that can fail to build on a
 * new host. Each password gets its own random salt, and the parameters are
 * stored alongside the hash so they can be raised later without invalidating
 * everyone's existing password.
 */
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

// ~16 MB of memory per hash: costly enough to make offline guessing slow,
// cheap enough that a sign-in still feels instant.
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAXMEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

async function derive(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number
) {
  return scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: MAXMEM,
  });
}

/** Returns `scrypt$N$r$p$salt$hash`, everything needed to verify it later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = PARAMS;
  const hash = await derive(password, salt, N, r, p);
  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/**
 * Checks a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed or unknown-format hash —
 * a corrupt row should deny access, not crash the sign-in route.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = await derive(password, salt, N, r, p);
    // Lengths must match before timingSafeEqual, which throws otherwise.
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

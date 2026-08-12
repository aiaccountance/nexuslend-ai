/**
 * How often one person may do an expensive thing.
 *
 * The things worth limiting are the ones that cost money or space every time
 * they happen: an upload runs a vision model and writes a file, signing up
 * creates a row anyone can create. Without a limit, one script can spend a
 * month's model budget in a minute — fifteen uploads in a tenth of a second is
 * what this codebase allowed before this file existed.
 *
 * Counts are kept in this process's memory. That's the right size for one
 * server and it costs nothing; it is also the thing to replace first when
 * there is more than one server, because each would then allow the full
 * quota. The note in `LIMITS` says as much.
 */
import { TRPCError } from "@trpc/server";

type Window = { count: number; resetAt: number };

/**
 * Per action: how many are allowed, and over how long.
 *
 * These are set to be invisible to a person using the app normally and
 * obvious to a script. Someone posting six outfits in an hour is having a
 * good day; someone posting sixty is not a person.
 */
export const LIMITS = {
  upload: { max: 20, windowMs: 60 * 60 * 1000 },
  addGarment: { max: 60, windowMs: 60 * 60 * 1000 },
  comment: { max: 60, windowMs: 60 * 60 * 1000 },
  signUp: { max: 10, windowMs: 60 * 60 * 1000 },
  signIn: { max: 20, windowMs: 15 * 60 * 1000 },
} as const;

export type LimitedAction = keyof typeof LIMITS;

const windows = new Map<string, Window>();

/** Stops the map growing without bound in a long-running process. */
const SWEEP_EVERY = 500;
let sinceSweep = 0;

function sweep(now: number) {
  if (++sinceSweep < SWEEP_EVERY) return;
  sinceSweep = 0;
  for (const key of Array.from(windows.keys())) {
    const window = windows.get(key);
    if (window && window.resetAt <= now) windows.delete(key);
  }
}

/**
 * Records one use of `action` by `who` and says whether it was allowed.
 *
 * `who` is a user id where there is one, and the caller's address where there
 * isn't — signing up has no user yet.
 */
export function take(action: LimitedAction, who: string | number) {
  const now = Date.now();
  sweep(now);

  const { max, windowMs } = LIMITS[action];
  const key = `${action}:${who}`;
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= max) {
    return { allowed: false, retryAfterMs: existing.resetAt - now };
  }

  existing.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * The same thing, but it throws the error the caller should see. The message
 * says when to come back, because "too many requests" with no number is the
 * most annoying error on the internet.
 */
export function enforce(action: LimitedAction, who: string | number) {
  const result = take(action, who);
  if (result.allowed) return;
  throw new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `That's a lot at once — try again ${inWords(result.retryAfterMs)}.`,
  });
}

/** Only used for tests, so one case cannot leak into the next. */
export function resetAllLimits() {
  windows.clear();
  sinceSweep = 0;
}

function inWords(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return "in a minute";
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

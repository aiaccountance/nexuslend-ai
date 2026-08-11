import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";
import * as accountsDb from "./accountsDb";
import * as outfitsDb from "./outfitsDb";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "./password";

/** Surface rule violations as 4xx codes with their message intact. */
async function enforcingRules<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof outfitsDb.OutfitRuleError) {
      throw new TRPCError({ code: err.code, message: err.message });
    }
    throw err;
  }
}

const usernameInput = z.string().min(1).max(40);
const passwordInput = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH);

/** The shape the client needs to render "who am I". */
function publicAccount(account: accountsDb.Account, name?: string | null) {
  return {
    userId: account.userId,
    username: account.username,
    displayUsername: account.displayUsername,
    name: name ?? null,
    bio: account.bio,
    avatarUrl: account.avatarUrl,
    hasPassword: Boolean(account.passwordHash),
  };
}

export const accountsRouter = router({
  /**
   * Live check for the sign-up form. Public, because it runs before anyone has
   * an account — it only ever reveals whether a handle is free, which is the
   * same thing the eventual sign-up attempt would reveal.
   */
  checkUsername: publicProcedure
    .input(z.object({ username: usernameInput }))
    .query(async ({ input }) => {
      const check = accountsDb.checkUsername(input.username);
      if (!check.ok) {
        return {
          available: false,
          reason: accountsDb.describeUsernameProblem(check.problem),
          suggestions: [] as string[],
        };
      }
      const available = await accountsDb.isUsernameAvailable(check.canonical);
      return {
        available,
        reason: available ? null : "That username is taken",
        suggestions: available
          ? []
          : await accountsDb.suggestUsernames(check.canonical),
      };
    }),

  signUp: publicProcedure
    .input(
      z.object({
        username: usernameInput,
        password: passwordInput,
        displayName: z.string().max(80).optional(),
        email: z.string().email().max(320).optional().or(z.literal("")),
      })
    )
    .mutation(async ({ ctx, input }) =>
      enforcingRules(async () => {
        const { user, openId } = await accountsDb.signUp({
          username: input.username,
          password: input.password,
          displayName: input.displayName,
          email: input.email || null,
        });

        const token = await sdk.createSessionToken(openId, {
          name: user.name || input.username,
          expiresInMs: ONE_YEAR_MS,
        });
        ctx.res.cookie(COOKIE_NAME, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });

        const account = (await accountsDb.getAccountByUserId(user.id))!;
        return { success: true, account: publicAccount(account, user.name) };
      })
    ),

  signIn: publicProcedure
    .input(z.object({ username: usernameInput, password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await accountsDb.signIn(input.username, input.password);
      if (!result) {
        // Same message either way — never reveal which half was wrong.
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Wrong username or password",
        });
      }

      const token = await sdk.createSessionToken(result.user.openId, {
        name: result.user.name || result.account.displayUsername,
        expiresInMs: ONE_YEAR_MS,
      });
      ctx.res.cookie(COOKIE_NAME, token, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: ONE_YEAR_MS,
      });

      return {
        success: true,
        account: publicAccount(result.account, result.user.name),
      };
    }),

  signOut: publicProcedure.mutation(async ({ ctx }) => {
    ctx.res.clearCookie(COOKIE_NAME, getSessionCookieOptions(ctx.req));
    return { success: true };
  }),

  /** Who am I — null when signed out, and `account: null` before a handle. */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return { signedIn: false as const, account: null };
    const account = await accountsDb.getAccountByUserId(ctx.user.id);
    return {
      signedIn: true as const,
      account: account ? publicAccount(account, ctx.user.name) : null,
    };
  }),

  /** For someone who arrived through the existing sign-in and has no handle. */
  claimUsername: protectedProcedure
    .input(
      z.object({
        username: usernameInput,
        displayName: z.string().max(80).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      enforcingRules(async () => {
        const account = await accountsDb.claimUsername(
          ctx.user.id,
          input.username,
          input.displayName
        );
        return {
          success: true,
          account: publicAccount(account, ctx.user.name),
        };
      })
    ),

  /** A profile by handle, for /outfits/@someone. */
  byUsername: publicProcedure
    .input(z.object({ username: usernameInput }))
    .query(async ({ input }) => {
      const account = await accountsDb.getAccountByUsername(input.username);
      if (!account) return null;
      return {
        userId: account.userId,
        username: account.username,
        displayUsername: account.displayUsername,
        bio: account.bio,
        avatarUrl: account.avatarUrl,
      };
    }),

  updateProfile: protectedProcedure
    .input(z.object({ bio: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) =>
      enforcingRules(async () => {
        const existing = await accountsDb.getAccountByUserId(ctx.user.id);
        if (!existing) {
          throw new outfitsDb.OutfitRuleError(
            "Pick a username first",
            "BAD_REQUEST"
          );
        }
        const account = await accountsDb.updateProfile(ctx.user.id, {
          bio: input.bio?.trim() || null,
        });
        return {
          success: true,
          account: publicAccount(account!, ctx.user.name),
        };
      })
    ),

  setAvatar: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1).max(8_000_000),
        mimeType: z.string().startsWith("image/"),
      })
    )
    .mutation(async ({ ctx, input }) =>
      enforcingRules(async () => {
        const existing = await accountsDb.getAccountByUserId(ctx.user.id);
        if (!existing) {
          throw new outfitsDb.OutfitRuleError(
            "Pick a username first",
            "BAD_REQUEST"
          );
        }

        const ext = input.mimeType.split("/")[1] || "jpg";
        const { url, key } = await storagePut(
          `avatars/${ctx.user.id}-${Date.now()}.${ext}`,
          Buffer.from(input.fileBase64, "base64"),
          input.mimeType
        );

        const account = await accountsDb.updateProfile(ctx.user.id, {
          avatarUrl: url,
          avatarKey: key,
        });
        return {
          success: true,
          account: publicAccount(account!, ctx.user.name),
        };
      })
    ),

  /** Adds a password to an account that signed in through the portal. */
  setPassword: protectedProcedure
    .input(z.object({ password: passwordInput }))
    .mutation(async ({ ctx, input }) =>
      enforcingRules(async () => {
        const existing = await accountsDb.getAccountByUserId(ctx.user.id);
        if (!existing) {
          throw new outfitsDb.OutfitRuleError(
            "Pick a username first",
            "BAD_REQUEST"
          );
        }
        await accountsDb.setPassword(ctx.user.id, input.password);
        return { success: true };
      })
    ),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().max(60),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) =>
      accountsDb.searchAccounts(input.query, input.limit)
    ),
});

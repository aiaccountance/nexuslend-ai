import { useCallback } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Who the current person is inside Outfit Arena.
 *
 * Three states worth telling apart:
 *   signedOut   — nobody is here
 *   needsHandle — signed in through the lending product's sign-in, but has not
 *                 picked a username yet, so they cannot post
 *   ready       — has an account and a handle
 */
export function useAccount() {
  const utils = trpc.useUtils();
  const meQuery = trpc.accounts.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const refresh = useCallback(async () => {
    await utils.accounts.me.invalidate();
  }, [utils]);

  const signOutMutation = trpc.accounts.signOut.useMutation({
    onSuccess: async () => {
      utils.accounts.me.setData(undefined, {
        signedIn: false,
        account: null,
      });
      await utils.invalidate();
    },
  });

  const data = meQuery.data;
  const account = data?.account ?? null;
  const signedIn = Boolean(data?.signedIn);

  const state: "loading" | "signedOut" | "needsHandle" | "ready" =
    meQuery.isLoading
      ? "loading"
      : !signedIn
        ? "signedOut"
        : account
          ? "ready"
          : "needsHandle";

  return {
    state,
    account,
    signedIn,
    isLoading: meQuery.isLoading,
    refresh,
    signOut: () => signOutMutation.mutateAsync(),
    isSigningOut: signOutMutation.isPending,
  };
}

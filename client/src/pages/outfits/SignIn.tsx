import { useState, useEffect, FormEvent } from "react";
import { useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, Shirt } from "lucide-react";
import { toast } from "sonner";
import { useAccount } from "./useAccount";

type Mode = "signIn" | "signUp";

/** Debounced so the availability check does not fire on every keystroke. */
function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function SignIn({
  initialMode = "signIn",
}: {
  initialMode?: Mode;
}) {
  const [, navigate] = useLocation();
  const { state, refresh } = useAccount();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Already signed in and set up — nothing to do here.
  useEffect(() => {
    if (state === "ready") navigate("/outfits");
    if (state === "needsHandle") navigate("/outfits/pick-username");
  }, [state, navigate]);

  const debouncedUsername = useDebounced(username, 350);
  const availability = trpc.accounts.checkUsername.useQuery(
    { username: debouncedUsername },
    {
      enabled: mode === "signUp" && debouncedUsername.trim().length >= 3,
      retry: false,
    }
  );

  const signUp = trpc.accounts.signUp.useMutation();
  const signIn = trpc.accounts.signIn.useMutation();
  const busy = signUp.isPending || signIn.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "signUp") {
        await signUp.mutateAsync({
          username: username.trim(),
          password,
          displayName: displayName.trim() || undefined,
        });
        toast.success(`Welcome, @${username.trim().toLowerCase()}`);
      } else {
        await signIn.mutateAsync({ username: username.trim(), password });
        toast.success("Welcome back");
      }
      await refresh();
      navigate("/outfits");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const showAvailability =
    mode === "signUp" &&
    debouncedUsername.trim().length >= 3 &&
    !availability.isLoading;
  const taken = showAvailability && availability.data?.available === false;

  return (
    <div className="min-h-screen bg-[#0b0a12] text-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center mb-4">
            <Shirt className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Outfit Arena</h1>
          <p className="text-white/50 text-sm mt-1">
            {mode === "signUp"
              ? "Pick a username and start posting"
              : "Sign in to post, rate and compete"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-2"
            >
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
                @
              </span>
              <Input
                id="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete={mode === "signUp" ? "off" : "username"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="yourname"
                className="pl-7 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                required
              />
              {mode === "signUp" && availability.isFetching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white/40" />
              )}
              {showAvailability && availability.data?.available && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
              )}
              {taken && (
                <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400" />
              )}
            </div>
            {taken && (
              <div className="mt-2 text-xs">
                <p className="text-rose-300">{availability.data?.reason}</p>
                {(availability.data?.suggestions.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {availability.data!.suggestions.map(suggestion => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setUsername(suggestion)}
                        className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                      >
                        @{suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {mode === "signUp" && (
            <div>
              <label
                htmlFor="displayName"
                className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-2"
              >
                Display name{" "}
                <span className="normal-case font-normal">(optional)</span>
              </label>
              <Input
                id="displayName"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="How your name shows up"
                autoComplete="name"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-2"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={
                mode === "signUp" ? "new-password" : "current-password"
              }
              placeholder={
                mode === "signUp" ? "At least 8 characters" : "Your password"
              }
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              required
              minLength={mode === "signUp" ? 8 : undefined}
            />
          </div>

          {error && (
            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy || taken}
            className="w-full bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:opacity-90 text-white border-0 h-11"
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {mode === "signUp" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-sm text-white/50 mt-6">
          {mode === "signUp" ? "Already here?" : "New to Outfit Arena?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signUp" ? "signIn" : "signUp");
              setError(null);
            }}
            className="text-fuchsia-300 hover:text-fuchsia-200 font-medium"
          >
            {mode === "signUp" ? "Sign in" : "Create an account"}
          </button>
        </p>

        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <a
            href={getLoginUrl()}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Or continue with your NexusLend sign-in
          </a>
        </div>

        <p className="text-center mt-6">
          <Link
            href="/outfits"
            className="text-xs text-white/30 hover:text-white/60"
          >
            Look around first
          </Link>
        </p>
      </div>
    </div>
  );
}

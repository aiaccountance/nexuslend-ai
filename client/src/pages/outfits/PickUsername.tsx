import { useState, useEffect, FormEvent } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, AtSign } from "lucide-react";
import { toast } from "sonner";
import { useAccount } from "./useAccount";

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Shown once to someone who signed in through NexusLend but has no handle yet.
 * They cannot post until they have one — everything in the arena is credited to
 * a username.
 */
export default function PickUsername() {
  const [, navigate] = useLocation();
  const { state, refresh } = useAccount();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state === "ready") navigate("/outfits");
    if (state === "signedOut") navigate("/outfits/signin");
  }, [state, navigate]);

  const debounced = useDebounced(username, 350);
  const availability = trpc.accounts.checkUsername.useQuery(
    { username: debounced },
    { enabled: debounced.trim().length >= 3, retry: false }
  );

  const claim = trpc.accounts.claimUsername.useMutation();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await claim.mutateAsync({ username: username.trim() });
      toast.success(`You're @${username.trim().toLowerCase()}`);
      await refresh();
      navigate("/outfits");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const ready = debounced.trim().length >= 3 && !availability.isLoading;
  const taken = ready && availability.data?.available === false;

  return (
    <div className="min-h-screen bg-[#0b0a12] text-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center mb-4">
            <AtSign className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Pick your username
          </h1>
          <p className="text-white/50 text-sm mt-2">
            This is how you'll show up on every outfit you post, rate and win.
            You can't change it later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
              @
            </span>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className="pl-7 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11"
              required
            />
            {availability.isFetching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white/40" />
            )}
            {ready && availability.data?.available && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
            )}
            {taken && (
              <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400" />
            )}
          </div>

          {taken && (
            <div className="text-xs">
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

          {error && (
            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={claim.isPending || taken || username.trim().length < 3}
            className="w-full bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:opacity-90 text-white border-0 h-11"
          >
            {claim.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Claim @{username.trim().toLowerCase() || "username"}
          </Button>
        </form>
      </div>
    </div>
  );
}

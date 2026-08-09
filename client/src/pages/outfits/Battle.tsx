import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Swords, ImageOff } from "lucide-react";
import { useState } from "react";

export default function Battle() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [lastResult, setLastResult] = useState<{ winnerId: number } | null>(
    null
  );

  const nextQuery = trpc.outfits.battle.next.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const voteMutation = trpc.outfits.battle.vote.useMutation({
    onSuccess: (_data, variables) => {
      setLastResult({ winnerId: variables.winnerId });
      toast.success("Vote counted!");
      setTimeout(() => {
        setLastResult(null);
        utils.outfits.battle.next.invalidate();
      }, 900);
    },
    onError: err => toast.error(`Vote failed: ${err.message.slice(0, 120)}`),
  });

  const handleVote = (winnerId: number, postAId: number, postBId: number) => {
    if (!isAuthenticated) {
      toast("Sign in to vote in battles");
      return;
    }
    if (voteMutation.isPending || lastResult) return;
    voteMutation.mutate({ postAId, postBId, winnerId });
  };

  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="flex items-center justify-center gap-2 mb-1">
        <Swords className="w-6 h-6 text-fuchsia-400" />
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          Outfit Battle
        </h1>
      </div>
      <p className="text-white/50 text-sm mb-8">
        Pick the better fit. Every vote moves the Elo rankings.
      </p>

      {nextQuery.isLoading && (
        <div className="flex items-center justify-center py-24 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {!nextQuery.isLoading && !nextQuery.data && (
        <div className="flex flex-col items-center justify-center py-24 text-center text-white/40 gap-3">
          <ImageOff className="w-10 h-10" />
          <p>
            {isAuthenticated
              ? "No matchups yet — you can't judge your own outfits, so there need to be at least 2 from other people."
              : "Need at least 2 posted outfits to start a battle."}
          </p>
        </div>
      )}

      {nextQuery.data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {[nextQuery.data.postA, nextQuery.data.postB].map((post, idx) => {
            const opponent =
              idx === 0 ? nextQuery.data!.postB : nextQuery.data!.postA;
            const isWinner = lastResult?.winnerId === post.id;
            const isLoser = lastResult && lastResult.winnerId !== post.id;
            return (
              <button
                key={post.id}
                onClick={() =>
                  handleVote(
                    post.id,
                    nextQuery.data!.postA.id,
                    nextQuery.data!.postB.id
                  )
                }
                disabled={voteMutation.isPending || !!lastResult}
                className={`group relative rounded-2xl overflow-hidden border-2 transition-all ${
                  isWinner
                    ? "border-fuchsia-400 scale-[1.02]"
                    : isLoser
                      ? "border-white/5 opacity-40"
                      : "border-white/10 hover:border-fuchsia-400/50"
                }`}
              >
                <img
                  src={post.imageUrl}
                  alt="Outfit"
                  className="w-full h-[420px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-4 text-left">
                  <span className="inline-block px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold capitalize">
                    {post.category}
                  </span>
                </div>
                {!lastResult && (
                  <div className="absolute inset-0 bg-fuchsia-500/0 group-hover:bg-fuchsia-500/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="px-4 py-2 rounded-full bg-fuchsia-500 text-white text-sm font-bold">
                      Vote for this fit
                    </span>
                  </div>
                )}
                {isWinner && (
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-fuchsia-500 text-white text-xs font-bold">
                    Winner
                  </div>
                )}
                <span className="sr-only">vs {opponent.id}</span>
              </button>
            );
          })}
        </div>
      )}

      {!isAuthenticated && (
        <p className="text-white/40 text-sm mt-8">
          <a href={getLoginUrl()} className="text-fuchsia-300 hover:underline">
            Sign in
          </a>{" "}
          to cast your vote.
        </p>
      )}

      {nextQuery.data && (
        <Button
          variant="ghost"
          onClick={() => utils.outfits.battle.next.invalidate()}
          className="mt-8 text-white/50 hover:text-white hover:bg-white/10"
        >
          Skip this matchup
        </Button>
      )}
    </div>
  );
}

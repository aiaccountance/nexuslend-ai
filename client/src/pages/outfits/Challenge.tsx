import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Flame, Loader2, Star, Trophy, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthorChip } from "./AuthorChip";
import { OutfitImage } from "./OutfitImage";
import { useAccount } from "./useAccount";

/**
 * The challenge running this week.
 *
 * A theme and a deadline is the cheapest reason to post again — it turns
 * "should I post something?" into "have I done this week's one?". Entries are
 * outfits that already exist, so entering costs one tap.
 */
export default function Challenge() {
  const { state } = useAccount();
  const currentQuery = trpc.arena.challenges.current.useQuery();
  const pastQuery = trpc.arena.challenges.past.useQuery();

  if (currentQuery.isLoading) {
    return (
      <div className="flex justify-center py-24 text-white/40">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const current = currentQuery.data;
  const past = pastQuery.data ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
        <Flame className="w-6 h-6 text-fuchsia-400" />
        This week's challenge
      </h1>

      {!current ? (
        <p className="text-white/40 text-sm mt-6">
          No challenge is running at the moment. The next one starts soon.
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/10 to-violet-600/5 p-5">
            <h2 className="text-xl font-bold">{current.challenge.title}</h2>
            <p className="text-white/70 text-sm mt-1.5 leading-relaxed">
              {current.challenge.prompt}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-white/50">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {closesIn(current.challenge.endsAt)}
              </span>
              <span>
                {current.entryCount}{" "}
                {current.entryCount === 1 ? "entry" : "entries"}
              </span>
            </div>

            {state === "ready" ? (
              <EnterButtons challengeId={current.challenge.id} />
            ) : (
              <Link href="/outfits/signin">
                <Button
                  size="sm"
                  className="mt-4 bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
                >
                  Sign in to enter
                </Button>
              </Link>
            )}
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mt-8 mb-3">
            Leading entries
          </h3>
          {current.entries.length === 0 ? (
            <p className="text-white/40 text-sm">
              Nobody has entered yet. Be first and you're top of the board until
              someone beats you.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {current.entries.map((row, i) => (
                <Link
                  key={row.post.id}
                  href={`/outfits/post/${row.post.id}`}
                  className="relative rounded-xl overflow-hidden bg-white/[0.03] border border-white/10 hover:border-white/25 transition-colors"
                >
                  {i === 0 && (
                    <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-bold">
                      Leading
                    </span>
                  )}
                  <OutfitImage
                    src={row.post.imageUrl}
                    alt={row.post.caption ?? "An entry"}
                    className="w-full aspect-[3/4] object-cover"
                  />
                  <div className="p-2 flex items-center justify-between gap-2">
                    <AuthorChip author={row} size="sm" linked={false} />
                    {row.avgRating !== null && (
                      <span className="flex items-center gap-1 text-[11px] text-white/50">
                        <Star className="w-3 h-3 text-amber-300 fill-amber-300" />
                        {row.avgRating.toFixed(1)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            Finished
          </h3>
          <ul className="space-y-1.5">
            {past.map(challenge => (
              <li
                key={challenge.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {challenge.title}
                  </p>
                  <p className="text-xs text-white/35">
                    Closed {new Date(challenge.endsAt).toLocaleDateString()}
                  </p>
                </div>
                {challenge.winnerPostId ? (
                  <Link
                    href={`/outfits/post/${challenge.winnerPostId}`}
                    className="flex items-center gap-1.5 text-xs text-amber-300 shrink-0"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    Winner
                  </Link>
                ) : (
                  <span className="text-xs text-white/25 shrink-0">
                    No winner
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Your own outfits, each with one tap to put it in or take it out. */
function EnterButtons({ challengeId }: { challengeId: number }) {
  const utils = trpc.useUtils();
  const mine = trpc.arena.challenges.myOutfits.useQuery(
    { limit: 12 },
    { retry: false }
  );
  const entered = trpc.arena.challenges.myEntries.useQuery({ challengeId });

  const invalidate = () => {
    utils.arena.challenges.current.invalidate();
    utils.arena.challenges.myEntries.invalidate();
  };
  const enter = trpc.arena.challenges.enter.useMutation({
    onSuccess: () => {
      toast.success("Entered");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const withdraw = trpc.arena.challenges.withdraw.useMutation({
    onSuccess: invalidate,
    onError: error => toast.error(error.message),
  });

  const posts = mine.data ?? [];
  const enteredIds = new Set(entered.data ?? []);

  if (mine.isLoading) return null;
  if (posts.length === 0) {
    return (
      <Link href="/outfits/upload">
        <Button
          size="sm"
          className="mt-4 bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
        >
          Post an outfit to enter
        </Button>
      </Link>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-xs text-white/40 mb-2">Enter one of your outfits</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {posts.map(row => {
          const isIn = enteredIds.has(row.post.id);
          return (
            <button
              key={row.post.id}
              onClick={() =>
                isIn
                  ? withdraw.mutate({ challengeId, postId: row.post.id })
                  : enter.mutate({ challengeId, postId: row.post.id })
              }
              aria-pressed={isIn}
              className={`relative shrink-0 w-16 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                isIn ? "border-fuchsia-400" : "border-transparent opacity-70"
              }`}
            >
              <img
                src={row.post.imageUrl}
                alt={row.post.caption ?? "One of your outfits"}
                className="w-full h-full object-cover"
              />
              {isIn && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-fuchsia-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Closes in 3 days" — a deadline nobody has to work out. */
function closesIn(at: Date | string): string {
  const left = new Date(at).getTime() - Date.now();
  if (left <= 0) return "Closed";
  const hours = Math.round(left / 3_600_000);
  if (hours < 1) return "Closes within the hour";
  if (hours < 24) return `Closes in ${hours}h`;
  const days = Math.round(hours / 24);
  return `Closes in ${days} ${days === 1 ? "day" : "days"}`;
}

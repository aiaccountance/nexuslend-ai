import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { StarRating } from "./StarRating";
import { OutfitImage } from "./OutfitImage";
import { ReportButton } from "./ReportButton";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  ImageOff,
  Crown,
  LayoutGrid,
  Rows3,
  Flame,
} from "lucide-react";
import { Comments } from "./Comments";
import { AuthorChip } from "./AuthorChip";
import { SwipeFeed } from "./SwipeFeed";
import { toast } from "sonner";

const SORTS = [
  { value: "new", label: "Newest" },
  { value: "top", label: "Top Rated" },
  { value: "trending", label: "Trending" },
] as const;

const VIEWS = [
  { value: "grid", label: "Grid view", icon: LayoutGrid },
  { value: "swipe", label: "Swipe view", icon: Rows3 },
] as const;

const CATEGORIES = [
  "casual",
  "streetwear",
  "formal",
  "athletic",
  "vintage",
  "other",
] as const;

export default function Feed() {
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("new");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [view, setView] = useState<"grid" | "swipe">("grid");
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();

  // Paged rather than a single fixed batch: the feed used to stop dead at
  // thirty outfits with no way to see the thirty-first.
  const feedQuery = trpc.outfits.feed.useInfiniteQuery(
    {
      sort,
      category: category as (typeof CATEGORIES)[number] | undefined,
      limit: 30,
    },
    { getNextPageParam: page => page.nextCursor }
  );

  const posts = useMemo(
    () => feedQuery.data?.pages.flatMap(page => page.posts) ?? [],
    [feedQuery.data]
  );

  const rateMutation = trpc.outfits.rate.useMutation({
    onSuccess: () => utils.outfits.feed.invalidate(),
    onError: err => toast.error(err.message || "Couldn't save your rating"),
  });

  const handleRate = (postId: number, rating: number) => {
    if (!isAuthenticated) {
      toast("Sign in to rate outfits");
      return;
    }
    rateMutation.mutate({ postId, rating });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            The Feed
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Post your fit. Rate the competition. Climb the board.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            {VIEWS.map(v => (
              <button
                key={v.value}
                onClick={() => setView(v.value)}
                aria-pressed={view === v.value}
                title={v.label}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  view === v.value
                    ? "bg-fuchsia-500/20 text-fuchsia-200"
                    : "text-white/50 hover:text-white"
                }`}
              >
                <v.icon className="w-4 h-4" />
                <span className="sr-only">{v.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            {SORTS.map(s => (
              <button
                key={s.value}
                onClick={() => setSort(s.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  sort === s.value
                    ? "bg-fuchsia-500/20 text-fuchsia-200"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <select
            value={category ?? ""}
            onChange={e => setCategory(e.target.value || undefined)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80"
          >
            <option value="">All categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c} className="bg-[#0b0a12]">
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ChallengeBanner />

      {view === "grid" && <OutfitOfTheWeek />}

      {feedQuery.isLoading && (
        <div className="flex items-center justify-center py-24 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {feedQuery.data && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center text-white/40 gap-3">
          <ImageOff className="w-10 h-10" />
          <p>No outfits posted yet — be the first.</p>
          <Link
            href="/outfits/upload"
            className="text-fuchsia-300 hover:underline text-sm"
          >
            Post an outfit →
          </Link>
        </div>
      )}

      {view === "swipe" && posts.length > 0 && (
        <SwipeFeed
          items={posts}
          canRate={isAuthenticated}
          onRate={handleRate}
        />
      )}

      <div
        className={
          view === "grid"
            ? "columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4"
            : "hidden"
        }
      >
        {posts.map(({ post, avgRating, ...author }) => (
          <div
            key={post.id}
            className="break-inside-avoid bg-white/5 border border-white/10 rounded-2xl overflow-hidden group"
          >
            <div className="relative">
              <OutfitImage
                src={post.imageUrl}
                alt={post.caption || "Outfit"}
                className="w-full h-auto min-h-[220px] object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center justify-between">
                <Badge className="bg-white/15 border-0 text-white backdrop-blur-sm capitalize">
                  {post.category}
                </Badge>
                {typeof post.aiStyleScore === "number" && (
                  <Badge className="bg-fuchsia-500/80 border-0 text-white backdrop-blur-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> {post.aiStyleScore}
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-3 space-y-2">
              {post.caption && (
                <p className="text-sm text-white/80 line-clamp-2">
                  {post.caption}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <AuthorChip author={author} size="sm" />
                <ReportButton postId={post.id} authorUserId={post.userId} compact />
              </div>
              {post.aiTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {post.aiTags.slice(0, 3).map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-200/80 border border-fuchsia-400/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {post.aiFeedback && (
                <details className="group/ai">
                  <summary className="text-[11px] text-fuchsia-300/70 hover:text-fuchsia-300 cursor-pointer list-none flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> AI stylist take
                  </summary>
                  <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                    {post.aiFeedback}
                  </p>
                  {post.aiSuggestions.length > 0 && (
                    <ul className="text-xs text-white/50 mt-1.5 space-y-0.5 list-disc list-inside">
                      {post.aiSuggestions.map(s => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
              <Comments postId={post.id} />
              <div className="flex items-center justify-between pt-1">
                <StarRating
                  value={avgRating}
                  interactive={post.userId !== user?.id}
                  onRate={rating => handleRate(post.id, rating)}
                />
                <span className="text-[11px] text-white/40">
                  {post.userId === user?.id
                    ? "Your outfit"
                    : post.ratingCount > 0
                      ? `${avgRating?.toFixed(1)} (${post.ratingCount})`
                      : "No ratings yet"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {view === "grid" && feedQuery.hasNextPage && (
        <div className="flex justify-center pt-6">
          <button
            onClick={() => feedQuery.fetchNextPage()}
            disabled={feedQuery.isFetchingNextPage}
            className="px-5 py-2.5 text-sm rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/25 transition-colors disabled:opacity-50"
          >
            {feedQuery.isFetchingNextPage ? "Loading…" : "Show more outfits"}
          </button>
        </div>
      )}

      {!isAuthenticated && (
        <p className="text-center text-white/40 text-sm mt-10">
          <a href={getLoginUrl()} className="text-fuchsia-300 hover:underline">
            Sign in
          </a>{" "}
          to rate outfits, post your own, and battle.
        </p>
      )}
    </div>
  );
}

/**
 * The week's challenge, at the top of the feed.
 *
 * Sits above everything because it's the one thing on this page with a
 * deadline — everything else will still be here tomorrow.
 */
function ChallengeBanner() {
  const challengeQuery = trpc.arena.challenges.current.useQuery();
  const current = challengeQuery.data;
  if (!current) return null;

  return (
    <Link
      href="/outfits/challenge"
      className="flex items-center gap-3 mb-5 p-3.5 rounded-2xl border border-fuchsia-400/25 bg-gradient-to-r from-fuchsia-500/12 to-violet-600/5 hover:border-fuchsia-400/50 transition-colors"
    >
      <span className="w-9 h-9 rounded-xl bg-fuchsia-500/20 flex items-center justify-center shrink-0">
        <Flame className="w-4.5 h-4.5 text-fuchsia-300" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">
          {current.challenge.title}
        </p>
        <p className="text-xs text-white/50 truncate">
          {current.entryCount}{" "}
          {current.entryCount === 1 ? "entry" : "entries"} so far
        </p>
      </div>
      <span className="text-xs text-fuchsia-200 font-medium shrink-0">
        Enter
      </span>
    </Link>
  );
}

function OutfitOfTheWeek() {
  const query = trpc.outfits.outfitOfTheWeek.useQuery();
  const winner = query.data;
  if (!winner) return null;

  return (
    <Link
      href={`/outfits/u/${winner.post.userId}`}
      className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-fuchsia-500/10 to-transparent border border-amber-400/25 hover:border-amber-400/50 transition-colors"
    >
      <OutfitImage
        src={winner.post.imageUrl}
        alt={winner.post.caption || "Outfit of the week"}
        className="w-16 h-16 rounded-xl object-cover shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-bold uppercase tracking-wide">
          <Crown className="w-3.5 h-3.5" /> Outfit of the Week
        </div>
        <p className="font-bold truncate">
          {winner.post.caption || "Untitled look"}
        </p>
        <p className="text-xs text-white/50">
          <AuthorChip author={winner} size="sm" linked={false} /> ·{" "}
          {winner.post.battleWins}{" "}
          battle
          {winner.post.battleWins === 1 ? " win" : " wins"}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className="font-black text-amber-300">{winner.post.eloRating}</div>
        <div className="text-[10px] text-white/40">Elo</div>
      </div>
    </Link>
  );
}

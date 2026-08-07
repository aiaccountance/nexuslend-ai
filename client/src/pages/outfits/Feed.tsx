import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { StarRating } from "./StarRating";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ImageOff } from "lucide-react";
import { toast } from "sonner";

const SORTS = [
  { value: "new", label: "Newest" },
  { value: "top", label: "Top Rated" },
  { value: "trending", label: "Trending" },
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
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const feedQuery = trpc.outfits.feed.useQuery({
    sort,
    category: category as (typeof CATEGORIES)[number] | undefined,
    limit: 30,
  });

  const rateMutation = trpc.outfits.rate.useMutation({
    onSuccess: () => utils.outfits.feed.invalidate(),
    onError: () => toast.error("Couldn't save your rating"),
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

      {feedQuery.isLoading && (
        <div className="flex items-center justify-center py-24 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {feedQuery.data && feedQuery.data.length === 0 && (
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

      <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
        {feedQuery.data?.map(({ post, authorName, avgRating }) => (
          <div
            key={post.id}
            className="break-inside-avoid bg-white/5 border border-white/10 rounded-2xl overflow-hidden group"
          >
            <div className="relative">
              <img
                src={post.imageUrl}
                alt={post.caption || "Outfit"}
                className="w-full h-auto object-cover"
                loading="lazy"
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
              <Link
                href={`/outfits/u/${post.userId}`}
                className="text-xs text-white/50 hover:text-fuchsia-300 transition-colors"
              >
                by {authorName || "Anonymous"}
              </Link>
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
              <div className="flex items-center justify-between pt-1">
                <StarRating
                  value={avgRating}
                  interactive
                  onRate={rating => handleRate(post.id, rating)}
                />
                <span className="text-[11px] text-white/40">
                  {post.ratingCount > 0
                    ? `${avgRating?.toFixed(1)} (${post.ratingCount})`
                    : "No ratings yet"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

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

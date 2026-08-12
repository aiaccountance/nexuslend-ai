import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, Star, Swords, ArrowLeft, ImageOff } from "lucide-react";
import { AuthorChip } from "./AuthorChip";
import { OutfitImage } from "./OutfitImage";
import { Comments } from "./Comments";

/**
 * One outfit on its own page.
 *
 * Everything that points at a single outfit — a notification, a search result,
 * a link someone sends a friend — needs somewhere to land, and the feed is not
 * that place: it scrolls, it reorders, and it can't be shared.
 */
export default function Post({ postId }: { postId: number }) {
  const postQuery = trpc.outfits.getPost.useQuery({ id: postId });

  if (postQuery.isLoading) {
    return (
      <div className="flex justify-center py-24 text-white/40">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const row = postQuery.data;
  if (!row) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-white/40 gap-3">
        <ImageOff className="w-10 h-10" />
        <p>This outfit is no longer here.</p>
        <Link href="/outfits" className="text-fuchsia-300 text-sm">
          Back to the feed
        </Link>
      </div>
    );
  }

  const { post, avgRating } = row;

  return (
    <div className="max-w-2xl">
      <Link
        href="/outfits"
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Feed
      </Link>

      <div className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10">
        <OutfitImage
          src={post.imageUrl}
          alt={post.caption ?? "An outfit"}
          className="w-full min-h-[200px] object-cover"
        />

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <AuthorChip author={row} />
            <div className="flex items-center gap-3 text-sm text-white/60">
              {avgRating !== null && (
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
                  {avgRating.toFixed(1)}
                  <span className="text-white/30">({post.ratingCount})</span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Swords className="w-4 h-4" />
                {post.eloRating}
              </span>
            </div>
          </div>

          {post.caption && (
            <p className="text-sm text-white/80">{post.caption}</p>
          )}

          {post.aiTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.aiTags.map(tag => (
                <Link
                  key={tag}
                  href={`/outfits/search?q=${encodeURIComponent(tag)}`}
                  className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-white/60 border border-white/10 hover:text-white"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          {post.aiFeedback && (
            <p className="text-xs text-white/45 leading-relaxed border-l-2 border-fuchsia-400/30 pl-3">
              {post.aiFeedback}
            </p>
          )}

          <Comments postId={post.id} />
        </div>
      </div>
    </div>
  );
}

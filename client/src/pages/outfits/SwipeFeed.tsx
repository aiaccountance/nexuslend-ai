import { useRef, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ChevronUp } from "lucide-react";
import { StarRating } from "./StarRating";
import { AuthorChip, type Author } from "./AuthorChip";

type FeedItem = {
  post: {
    id: number;
    imageUrl: string;
    caption: string | null;
    category: string;
    aiStyleScore: number | null;
    aiTags: string[];
    aiFeedback: string | null;
  };
  avgRating: number | null;
} & Author;

/**
 * One outfit at a time, full height, swipe or scroll to the next.
 *
 * Uses CSS scroll-snap rather than a gesture library: the browser already
 * handles momentum, rubber-banding and keyboard paging correctly, and it keeps
 * working when JavaScript is busy loading the next image.
 */
export function SwipeFeed({
  items,
  onRate,
  canRate,
}: {
  items: FeedItem[];
  onRate?: (postId: number, rating: number) => void;
  canRate: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // Track which outfit is showing, so the counter matches what you can see.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const next = Math.round(container.scrollTop / container.clientHeight);
      setIndex(prev => (next !== prev ? next : prev));
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="relative -mx-4 sm:-mx-6">
      <div
        ref={containerRef}
        className="h-[calc(100dvh-9rem)] overflow-y-auto snap-y snap-mandatory scroll-smooth
                   [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        tabIndex={0}
        aria-label="Outfit feed, one at a time"
      >
        {items.map(({ post, avgRating, ...author }) => (
          <section
            key={post.id}
            className="h-full snap-start snap-always relative flex items-center justify-center bg-black"
          >
            <img
              src={post.imageUrl}
              alt={post.caption || "Outfit"}
              className="max-h-full max-w-full object-contain"
              loading="lazy"
            />

            {/* Everything readable sits over a gradient, never bare on the photo. */}
            <div className="absolute inset-x-0 top-0 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between">
              <AuthorChip author={author} size="md" className="text-white" />
              <div className="flex items-center gap-2">
                <Badge className="bg-white/15 border-0 text-white backdrop-blur-sm capitalize">
                  {post.category}
                </Badge>
                {typeof post.aiStyleScore === "number" && (
                  <Badge className="bg-fuchsia-500/80 border-0 text-white backdrop-blur-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    {post.aiStyleScore}
                  </Badge>
                )}
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 p-4 pb-6 bg-gradient-to-t from-black/85 via-black/50 to-transparent space-y-3">
              {post.caption && (
                <p className="text-white text-sm leading-snug max-w-lg">
                  {post.caption}
                </p>
              )}
              {post.aiTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {post.aiTags.slice(0, 4).map(tag => (
                    <span
                      key={tag}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/80 backdrop-blur-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <StarRating
                  value={avgRating}
                  size="w-6 h-6"
                  interactive={canRate && Boolean(onRate)}
                  onRate={
                    onRate ? rating => onRate(post.id, rating) : undefined
                  }
                />
                {avgRating !== null && (
                  <span className="text-white/60 text-xs tabular-nums">
                    {avgRating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Position counter, and a hint on the first card that there is more. */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-[11px] text-white/70 tabular-nums pointer-events-none">
        {Math.min(index + 1, items.length)} / {items.length}
      </div>
      {index === 0 && items.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center text-white/40 text-[11px] pointer-events-none animate-pulse">
          <ChevronUp className="w-4 h-4" />
          swipe for more
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Star } from "lucide-react";

export function StarRating({
  value,
  userValue,
  interactive,
  onRate,
  size = "w-4 h-4",
}: {
  value: number | null;
  userValue?: number | null;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  size?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const displayValue = hover ?? userValue ?? value ?? 0;

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onMouseEnter={() => interactive && setHover(star)}
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            if (interactive) onRate?.(star);
          }}
          className={interactive ? "cursor-pointer" : "cursor-default"}
          aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
        >
          <Star
            className={`${size} transition-colors ${
              star <= Math.round(displayValue)
                ? "fill-fuchsia-400 text-fuchsia-400"
                : "fill-transparent text-white/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

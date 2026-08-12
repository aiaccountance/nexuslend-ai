import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * An outfit photo that doesn't leave a broken icon behind.
 *
 * Photos live in storage, and storage is the one part of this that can lose
 * something without the database noticing — a bucket moved, a file deleted, a
 * restore that missed a folder. When that happens the card should still say
 * whose outfit it was and what they called it, rather than showing the
 * browser's torn-paper icon.
 */
export function OutfitImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-white/[0.04] text-white/25 ${className}`}
        role="img"
        aria-label={`${alt} — photo unavailable`}
      >
        <ImageOff className="w-6 h-6" />
        <span className="text-[10px]">Photo unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setMissing(true)}
    />
  );
}

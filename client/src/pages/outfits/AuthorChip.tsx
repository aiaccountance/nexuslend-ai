import { Link } from "wouter";

export type Author = {
  authorName?: string | null;
  authorUsername?: string | null;
  authorDisplayUsername?: string | null;
  authorAvatarUrl?: string | null;
};

const SIZES = {
  sm: { avatar: "w-5 h-5", text: "text-xs" },
  md: { avatar: "w-7 h-7", text: "text-sm" },
  lg: { avatar: "w-10 h-10", text: "text-base" },
} as const;

/**
 * Who made this — avatar, handle, and a link to their profile.
 *
 * Everyone gets a handle at sign-up, but posts made before handles existed
 * still have an author with only a name, so this falls back to the name and
 * simply isn't a link in that case.
 */
export function AuthorChip({
  author,
  size = "md",
  className = "",
  linked = true,
}: {
  author: Author;
  size?: keyof typeof SIZES;
  className?: string;
  /**
   * Set false when this sits inside something that is already a link — a feed
   * card, a search result. A link inside a link is invalid HTML and browsers
   * are free to do whatever they like with the click.
   */
  linked?: boolean;
}) {
  const handle = author.authorDisplayUsername ?? author.authorUsername;
  const label = handle ? `@${handle}` : (author.authorName ?? "Someone");
  const initial = (handle ?? author.authorName ?? "?")
    .slice(0, 1)
    .toUpperCase();
  const { avatar, text } = SIZES[size];

  const inner = (
    <>
      {author.authorAvatarUrl ? (
        <img
          src={author.authorAvatarUrl}
          alt=""
          className={`${avatar} rounded-full object-cover shrink-0`}
        />
      ) : (
        <span
          className={`${avatar} rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      <span className={`${text} truncate`}>{label}</span>
    </>
  );

  if (!author.authorUsername || !linked) {
    return (
      <span className={`flex items-center gap-2 text-white/50 ${className}`}>
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={`/outfits/@${author.authorUsername}`}
      className={`flex items-center gap-2 text-white/70 hover:text-white transition-colors min-w-0 ${className}`}
    >
      {inner}
    </Link>
  );
}

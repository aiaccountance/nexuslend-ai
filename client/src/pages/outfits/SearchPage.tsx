import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Search as SearchIcon, Loader2, Star } from "lucide-react";
import { AuthorChip } from "./AuthorChip";
import { OutfitImage } from "./OutfitImage";

const CATEGORIES = [
  "casual",
  "streetwear",
  "formal",
  "athletic",
  "vintage",
  "other",
] as const;

/** Long enough that someone has stopped typing, short enough to feel instant. */
const SETTLE_MS = 250;

export default function SearchPage() {
  const params = new URLSearchParams(useSearch());
  const initial = params.get("q") ?? "";

  const [query, setQuery] = useState(initial);
  const [settled, setSettled] = useState(initial);
  const [category, setCategory] = useState<
    (typeof CATEGORIES)[number] | undefined
  >();

  // A request per keystroke would be one per letter typed; this waits for the
  // typing to stop.
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searching = settled.length >= 2 && !category;
  const results = trpc.arena.search.everything.useQuery(
    { query: settled },
    { enabled: searching }
  );
  const byCategory = trpc.arena.search.byCategory.useQuery(
    { category: category ?? "casual" },
    { enabled: Boolean(category) }
  );
  const tags = trpc.arena.search.trendingTags.useQuery(undefined, {
    enabled: !searching && !category,
  });

  const outfits = category ? (byCategory.data ?? []) : (results.data?.outfits ?? []);
  const people = category ? [] : (results.data?.people ?? []);
  const loading = category ? byCategory.isLoading : results.isLoading && searching;

  return (
    <div>
      <div className="relative mb-4">
        <SearchIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setCategory(undefined);
          }}
          placeholder="Search outfits, colours, people…"
          aria-label="Search"
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-400/50"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => {
              setCategory(category === c ? undefined : c);
              setQuery("");
            }}
            aria-pressed={category === c}
            className={`px-3 py-1.5 text-xs rounded-lg capitalize transition-colors ${
              category === c
                ? "bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/40"
                : "bg-white/5 text-white/60 border border-white/10 hover:text-white"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Nothing typed yet: what people are wearing at the moment. */}
      {!searching && !category && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            Showing up a lot right now
          </h2>
          {tags.isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-white/30" />
          ) : (tags.data?.length ?? 0) === 0 ? (
            <p className="text-white/40 text-sm">
              Once outfits are posted, the styles people are wearing appear
              here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.data?.map(tag => (
                <button
                  key={tag}
                  onClick={() => setQuery(tag)}
                  className="px-3 py-1.5 text-sm rounded-full bg-white/5 text-white/70 border border-white/10 hover:text-white hover:border-white/25"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {people.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            People
          </h2>
          <ul className="space-y-1">
            {people.map(person => (
              <li key={person.username}>
                <Link
                  href={`/outfits/@${person.username}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
                >
                  <AuthorChip
                    author={{
                      authorUsername: person.username,
                      authorDisplayUsername: person.displayUsername,
                      authorAvatarUrl: person.avatarUrl,
                    }}
                    linked={false}
                  />
                  {person.bio && (
                    <span className="text-xs text-white/40 truncate">
                      {person.bio}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outfits.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            Outfits
          </h2>
          {/* Pinterest-style: columns of varying heights rather than a grid of
              identical squares, so photos keep their own shape. */}
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
            {outfits.map(row => (
              <Link
                key={row.post.id}
                href={`/outfits/post/${row.post.id}`}
                className="block mb-3 break-inside-avoid rounded-xl overflow-hidden bg-white/[0.03] border border-white/10 hover:border-white/25 transition-colors"
              >
                <OutfitImage
                  src={row.post.imageUrl}
                  alt={row.post.caption ?? "An outfit"}
                  className="w-full h-auto min-h-[180px] object-cover"
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
        </section>
      )}

      {!loading &&
        (searching || category) &&
        outfits.length === 0 &&
        people.length === 0 && (
          <p className="text-white/40 text-sm py-12 text-center">
            Nothing matched {category ? `“${category}”` : `“${settled}”`}.
          </p>
        )}
    </div>
  );
}

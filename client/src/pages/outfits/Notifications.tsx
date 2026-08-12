import { useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  Star,
  MessageCircle,
  UserPlus,
  Swords,
  Trophy,
  Loader2,
} from "lucide-react";
import { AuthorChip } from "./AuthorChip";

/** What each kind of thing looks like at a glance. */
const LOOK = {
  rating: { icon: Star, tint: "text-amber-300" },
  comment: { icon: MessageCircle, tint: "text-sky-300" },
  follow: { icon: UserPlus, tint: "text-fuchsia-300" },
  battle_won: { icon: Swords, tint: "text-emerald-300" },
  battle_lost: { icon: Swords, tint: "text-white/40" },
  challenge_won: { icon: Trophy, tint: "text-amber-300" },
  weekly_winner: { icon: Trophy, tint: "text-amber-300" },
} as const;

export default function Notifications() {
  const utils = trpc.useUtils();
  const listQuery = trpc.arena.notifications.list.useQuery();
  const markAllRead = trpc.arena.notifications.markAllRead.useMutation({
    onSuccess: () => utils.arena.notifications.unreadCount.invalidate(),
  });

  // Opening the page is the acknowledgement — there's no "mark as read"
  // button to hunt for. The list keeps showing which ones were new.
  const hasRows = (listQuery.data?.length ?? 0) > 0;
  useEffect(() => {
    if (hasRows) markAllRead.mutate();
    // Once per visit, not once per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRows]);

  if (listQuery.isLoading) {
    return (
      <div className="flex justify-center py-20 text-white/40">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const rows = listQuery.data ?? [];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
        <Bell className="w-6 h-6 text-fuchsia-400" />
        Activity
      </h1>
      <p className="text-white/40 text-sm mb-6">
        Everything that has happened to your outfits.
      </p>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-white/40">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nothing yet.</p>
          <p className="text-sm mt-1">
            Post an outfit and this fills up as people rate it.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(row => {
            const { notification: n } = row;
            const look = LOOK[n.kind];
            const Icon = look.icon;
            const isNew = n.readAt === null;

            // The message links to the outfit and the chip links to the
            // person, so they sit side by side rather than one inside the
            // other — a link inside a link is not valid HTML and browsers
            // resolve it however they like.
            const message = n.postId ? (
              <Link
                href={`/outfits/post/${n.postId}`}
                className="text-sm text-white/85 leading-snug hover:text-white"
              >
                {n.body}
              </Link>
            ) : (
              <span className="text-sm text-white/85 leading-snug">
                {n.body}
              </span>
            );

            return (
              <li
                key={n.id}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                  isNew
                    ? "bg-fuchsia-500/[0.07] border-fuchsia-400/20"
                    : "bg-white/[0.03] border-white/5"
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${look.tint}`} />
                <div className="min-w-0 flex-1">
                  {message}
                  <div className="flex items-center gap-2 mt-1">
                    {row.actorUsername && (
                      <AuthorChip
                        author={{
                          authorUsername: row.actorUsername,
                          authorDisplayUsername: row.actorDisplayUsername,
                          authorAvatarUrl: row.actorAvatarUrl,
                        }}
                        size="sm"
                      />
                    )}
                    <span className="text-[11px] text-white/30">
                      {ago(n.createdAt)}
                    </span>
                  </div>
                </div>
                {isNew && (
                  <span className="w-2 h-2 rounded-full bg-fuchsia-400 mt-1.5 shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "3h ago", in the fewest words that are still true. */
function ago(at: Date | string): string {
  const then = new Date(at).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString();
}

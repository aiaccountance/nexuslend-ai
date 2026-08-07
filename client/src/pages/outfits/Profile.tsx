import { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { StarRating } from "./StarRating";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, UserPlus, UserCheck, Trophy, Swords } from "lucide-react";

export default function Profile({ userId }: { userId: string }) {
  const id = Number(userId);
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const profileQuery = trpc.outfits.profile.get.useQuery(
    { userId: id },
    { enabled: Number.isFinite(id) }
  );

  const followMutation = trpc.outfits.follow.toggle.useMutation({
    onSuccess: () => utils.outfits.profile.get.invalidate({ userId: id }),
    onError: err =>
      toast.error(`Couldn't update follow: ${err.message.slice(0, 120)}`),
  });

  if (profileQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <p className="text-center text-white/40 py-24">Stylist not found.</p>
    );
  }

  const {
    user,
    stats,
    posts,
    followerCount,
    followingCount,
    isFollowing,
    isSelf,
  } = profileQuery.data;
  const avgRating =
    stats && Number(stats.ratingCountTotal) > 0
      ? Number(stats.ratingSumTotal) / Number(stats.ratingCountTotal)
      : null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-2xl font-black shrink-0">
          {(user.name || "U").slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black">
            {user.name || "Anonymous Stylist"}
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/50 mt-1">
            <span>
              {followerCount} follower{followerCount === 1 ? "" : "s"}
            </span>
            <span>{followingCount} following</span>
            <span>
              {posts.length} outfit{posts.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {!isSelf &&
          (isAuthenticated ? (
            <Button
              onClick={() => followMutation.mutate({ userId: id })}
              disabled={followMutation.isPending}
              className={
                isFollowing
                  ? "border border-white/20 bg-transparent text-white hover:bg-white/10"
                  : "bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0"
              }
            >
              {isFollowing ? (
                <UserCheck className="w-4 h-4 mr-2" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              {isFollowing ? "Following" : "Follow"}
            </Button>
          ) : (
            <a href={getLoginUrl()}>
              <Button className="bg-gradient-to-r from-fuchsia-500 to-violet-600 border-0">
                <UserPlus className="w-4 h-4 mr-2" /> Follow
              </Button>
            </a>
          ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          icon={<Trophy className="w-4 h-4" />}
          label="Avg Elo"
          value={stats ? Math.round(Number(stats.avgElo)) : 1200}
        />
        <StatCard
          icon={<Swords className="w-4 h-4" />}
          label="Battle Record"
          value={stats ? `${stats.totalWins}-${stats.totalLosses}` : "0-0"}
        />
        <StatCard
          label="Avg Rating"
          value={avgRating ? avgRating.toFixed(1) : "—"}
        />
        <StatCard label="Outfits Posted" value={stats ? stats.postCount : 0} />
      </div>

      {posts.length === 0 ? (
        <p className="text-center text-white/40 py-16">
          No outfits posted yet.
        </p>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {posts.map(({ post, avgRating: postAvg }) => (
            <div
              key={post.id}
              className="break-inside-avoid bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
            >
              <img
                src={post.imageUrl}
                alt={post.caption || "Outfit"}
                className="w-full h-auto object-cover"
                loading="lazy"
              />
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className="bg-white/10 border-0 text-white/80 capitalize">
                    {post.category}
                  </Badge>
                  <StarRating value={postAvg} size="w-3.5 h-3.5" />
                </div>
                {post.caption && (
                  <p className="text-sm text-white/70 line-clamp-2">
                    {post.caption}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-white/40 text-[11px] uppercase tracking-wide mb-1">
        {icon} {label}
      </div>
      <div className="text-xl font-black text-fuchsia-300">{value}</div>
    </div>
  );
}

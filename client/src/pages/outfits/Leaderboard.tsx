import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { AuthorChip } from "./AuthorChip";
import { Loader2, Trophy, Medal } from "lucide-react";

const PERIODS = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "all", label: "This Season" },
] as const;

const RANK_COLORS = ["text-yellow-400", "text-slate-300", "text-amber-600"];

export default function Leaderboard() {
  const [tab, setTab] = useState<"posts" | "users">("posts");
  const [period, setPeriod] =
    useState<(typeof PERIODS)[number]["value"]>("week");

  const postsQuery = trpc.outfits.leaderboard.posts.useQuery(
    { period },
    { enabled: tab === "posts" }
  );
  const usersQuery = trpc.outfits.leaderboard.users.useQuery(
    { period },
    { enabled: tab === "users" }
  );

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Trophy className="w-6 h-6 text-fuchsia-400" />
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          Leaderboard
        </h1>
      </div>
      <p className="text-white/50 text-sm mb-6">
        Ranked by Elo — earned through head-to-head battle wins.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {(["posts", "users"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                tab === t
                  ? "bg-fuchsia-500/20 text-fuchsia-200"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {t === "posts" ? "Top Outfits" : "Top Stylists"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p.value
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {(tab === "posts" ? postsQuery.isLoading : usersQuery.isLoading) && (
        <div className="flex items-center justify-center py-24 text-white/40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {tab === "posts" && postsQuery.data && (
        <div className="space-y-2">
          {postsQuery.data.length === 0 && (
            <p className="text-center text-white/40 py-16">
              No outfits in this window yet.
            </p>
          )}
          {postsQuery.data.map((row, i) => (
            <div
              key={row.post.id}
              className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-3"
            >
              <div
                className={`w-8 text-center font-black ${RANK_COLORS[i] || "text-white/30"}`}
              >
                {i < 3 ? <Medal className="w-5 h-5 mx-auto" /> : i + 1}
              </div>
              <img
                src={row.post.imageUrl}
                alt="Outfit"
                className="w-14 h-14 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <AuthorChip author={row} size="sm" className="font-semibold" />
                <p className="text-xs text-white/40 capitalize mt-0.5">
                  {row.post.category}
                </p>
              </div>
              <div className="text-right">
                <div className="font-black text-fuchsia-300">
                  {row.post.eloRating}
                </div>
                <div className="text-[11px] text-white/40">
                  {row.post.battleWins}W-{row.post.battleLosses}L
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && usersQuery.data && (
        <div className="space-y-2">
          {usersQuery.data.length === 0 && (
            <p className="text-center text-white/40 py-16">
              No stylists ranked in this window yet.
            </p>
          )}
          {usersQuery.data.map((row, i) => (
            <div
              key={row.userId}
              className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-3"
            >
              <div
                className={`w-8 text-center font-black ${RANK_COLORS[i] || "text-white/30"}`}
              >
                {i < 3 ? <Medal className="w-5 h-5 mx-auto" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <AuthorChip author={row} size="lg" className="font-semibold" />
                <p className="text-xs text-white/40 mt-0.5">
                  {row.postCount} outfit{row.postCount === 1 ? "" : "s"} posted
                </p>
              </div>
              <div className="text-right">
                <div className="font-black text-fuchsia-300">
                  {Math.round(row.avgElo)}
                </div>
                <div className="text-[11px] text-white/40">
                  {row.totalWins} wins
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OutfitImage } from "./OutfitImage";

/**
 * The reports queue.
 *
 * Deliberately plain and deliberately fast to work through: the photograph,
 * what was said about it, and two buttons. Whoever sits here is making a
 * judgement dozens of times in a row, and anything that slows a single
 * decision down gets multiplied by the length of the queue.
 */

const REASON_LABELS: Record<string, string> = {
  nudity: "Nudity",
  harassment: "Harassment",
  hate: "Hate speech",
  violence: "Violence",
  spam: "Spam",
  not_their_photo: "Not their photo",
  under_age: "Appears under age",
  other: "Other",
};

/** The ones where leaving it up is worse than taking it down by mistake. */
const URGENT = new Set(["nudity", "under_age", "violence"]);

export default function Moderation() {
  const utils = trpc.useUtils();
  const queue = trpc.arena.safety.queue.useQuery();

  const refresh = () => {
    utils.arena.safety.queue.invalidate();
    utils.arena.safety.queueSize.invalidate();
    utils.outfits.feed.invalidate();
  };

  const uphold = trpc.arena.safety.uphold.useMutation({
    onSuccess: () => {
      toast.success("Taken down");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const dismiss = trpc.arena.safety.dismiss.useMutation({
    onSuccess: () => {
      toast.success("Left up");
      refresh();
    },
    onError: error => toast.error(error.message),
  });

  if (queue.isLoading) {
    return (
      <div className="flex justify-center py-20 text-white/40">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const rows = queue.data ?? [];

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
        <ShieldAlert className="w-6 h-6 text-fuchsia-400" />
        Reports
      </h1>
      <p className="text-white/40 text-sm mb-6">
        {rows.length === 0
          ? "Nothing waiting."
          : `${rows.length} waiting, oldest first.`}
      </p>

      <ul className="space-y-3">
        {rows.map(row => {
          const reason = row.report.reason;
          const alreadyHidden = Boolean(row.post?.hiddenAt);

          return (
            <li
              key={row.report.id}
              className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden"
            >
              <div className="flex gap-4 p-4">
                {row.post && (
                  <OutfitImage
                    src={row.post.imageUrl}
                    alt="Reported outfit"
                    className="w-24 h-32 rounded-xl object-cover shrink-0"
                  />
                )}

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                        URGENT.has(reason)
                          ? "bg-red-500/20 text-red-300"
                          : "bg-white/10 text-white/60"
                      }`}
                    >
                      {REASON_LABELS[reason] ?? reason}
                    </span>
                    {alreadyHidden && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-400/15 text-amber-300">
                        Already hidden
                      </span>
                    )}
                    <span className="text-[11px] text-white/30">
                      {new Date(row.report.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {row.report.note && (
                    <p className="text-sm text-white/70">"{row.report.note}"</p>
                  )}

                  <p className="text-xs text-white/40">
                    {row.report.commentId
                      ? "A comment"
                      : `Posted by @${row.reportedUsername ?? "unknown"}`}
                    {row.post?.caption ? ` — "${row.post.caption}"` : ""}
                  </p>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={uphold.isPending}
                      onClick={() =>
                        uphold.mutate({ reportId: row.report.id })
                      }
                      className="h-8 px-3 text-xs bg-red-500/80 hover:bg-red-500 border-0"
                    >
                      <X className="w-3.5 h-3.5 mr-1.5" />
                      Take it down
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dismiss.isPending}
                      onClick={() =>
                        dismiss.mutate({ reportId: row.report.id })
                      }
                      className="h-8 px-3 text-xs border-white/15 bg-transparent text-white/70 hover:bg-white/10"
                    >
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      It's fine, leave it
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length > 0 && (
        <p className="text-[11px] text-white/30 mt-6 max-w-xl leading-snug">
          Taking something down hides it — the photograph is not destroyed and
          the author keeps it, so a wrong call can be undone. Leaving it up also
          clears any automatic hide that reports had triggered.
        </p>
      )}
    </div>
  );
}

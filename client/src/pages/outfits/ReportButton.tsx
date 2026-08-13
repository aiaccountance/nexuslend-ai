import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Flag, Loader2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Saying "this shouldn't be here".
 *
 * Deliberately quiet — a small flag rather than a button competing with the
 * rating — but always in the same place on every post, because someone looking
 * for it is usually already upset and should not have to hunt.
 */

const REASONS = [
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "harassment", label: "Bullying or harassment" },
  { value: "hate", label: "Hate speech" },
  { value: "violence", label: "Violence or threats" },
  { value: "not_their_photo", label: "Not their photo" },
  { value: "under_age", label: "Appears to be a child" },
  { value: "spam", label: "Spam or a scam" },
  { value: "other", label: "Something else" },
] as const;

export function ReportButton({
  postId,
  commentId,
  authorUserId,
  compact = false,
}: {
  postId?: number;
  commentId?: number;
  /** Given when the person can also be blocked, which posts allow. */
  authorUserId?: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>();
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();

  const report = trpc.arena.safety.report.useMutation({
    onSuccess: result => {
      setOpen(false);
      setReason(undefined);
      setNote("");
      toast.success(
        result?.hidden
          ? "Reported, and hidden while someone looks at it"
          : "Reported — thank you"
      );
      utils.outfits.feed.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const block = trpc.arena.safety.block.useMutation({
    onSuccess: () => {
      setOpen(false);
      toast.success("Blocked. You won't see each other here again.");
      utils.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Report this"
        title="Report this"
        className={`text-white/25 hover:text-white/70 transition-colors ${
          compact ? "p-0.5" : "p-1"
        }`}
      >
        <Flag className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5">
      <p className="text-xs font-semibold text-white/70">
        What's wrong with this?
      </p>

      <div className="flex flex-wrap gap-1.5">
        {REASONS.map(option => (
          <button
            key={option.value}
            onClick={() => setReason(option.value)}
            aria-pressed={reason === option.value}
            className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
              reason === option.value
                ? "bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-400/40"
                : "bg-white/5 text-white/55 border border-white/10 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {reason && (
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Anything else we should know? (optional)"
          maxLength={500}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!reason || report.isPending}
          onClick={() =>
            report.mutate({
              postId,
              commentId,
              reason: reason as (typeof REASONS)[number]["value"],
              note: note.trim() || undefined,
            })
          }
          className="h-7 px-3 text-xs bg-fuchsia-500/80 hover:bg-fuchsia-500 border-0"
        >
          {report.isPending ? (
            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
          ) : null}
          Send report
        </Button>

        {authorUserId !== undefined && (
          <Button
            size="sm"
            variant="outline"
            disabled={block.isPending}
            onClick={() => block.mutate({ userId: authorUserId })}
            className="h-7 px-3 text-xs border-white/15 bg-transparent text-white/70 hover:bg-white/10"
          >
            <Ban className="w-3 h-3 mr-1.5" />
            Block them
          </Button>
        )}

        <button
          onClick={() => setOpen(false)}
          className="text-xs text-white/40 hover:text-white/70 ml-auto"
        >
          Cancel
        </button>
      </div>

      <p className="text-[10px] text-white/30 leading-snug">
        Blocking works straight away and needs nobody's approval. A report goes
        to a person, who will look at it.
      </p>
    </div>
  );
}

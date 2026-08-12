import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AuthorChip } from "./AuthorChip";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageCircle, Loader2, Trash2 } from "lucide-react";

export function Comments({ postId }: { postId: number }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();

  const listQuery = trpc.wardrobe.comments.list.useQuery(
    { postId },
    { enabled: open }
  );

  const addMutation = trpc.wardrobe.comments.add.useMutation({
    onSuccess: () => {
      setBody("");
      utils.wardrobe.comments.list.invalidate({ postId });
    },
    onError: err => toast.error(err.message.slice(0, 140)),
  });

  const deleteMutation = trpc.wardrobe.comments.delete.useMutation({
    onSuccess: () => utils.wardrobe.comments.list.invalidate({ postId }),
  });

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!isAuthenticated) {
      toast("Sign in to comment");
      return;
    }
    addMutation.mutate({ postId, body: trimmed });
  };

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[11px] text-white/40 hover:text-fuchsia-300 transition-colors"
      >
        <MessageCircle className="w-3 h-3" />
        {open ? "Hide comments" : "Comments"}
        {listQuery.data ? ` (${listQuery.data.length})` : ""}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {listQuery.isLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-white/30" />
          )}

          {listQuery.data?.length === 0 && (
            <p className="text-[11px] text-white/30">
              No comments yet — say something nice.
            </p>
          )}

          {listQuery.data?.map(({ comment, ...author }) => (
            <div key={comment.id} className="group flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <AuthorChip author={author} size="sm" />
                <p className="text-xs text-white/80 break-words mt-1">
                  {comment.body}
                </p>
              </div>
              {comment.userId === user?.id && (
                <button
                  onClick={() => deleteMutation.mutate({ id: comment.id })}
                  className="p-1 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  aria-label="Delete comment"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          <div className="flex gap-1.5 pt-1">
            <input
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder={
                isAuthenticated ? "Add a comment…" : "Sign in to comment"
              }
              maxLength={500}
              disabled={!isAuthenticated}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white placeholder:text-white/30 disabled:opacity-50"
            />
            <Button
              size="sm"
              onClick={submit}
              disabled={!body.trim() || addMutation.isPending}
              className="h-7 px-2.5 text-xs bg-fuchsia-500/80 hover:bg-fuchsia-500 border-0"
            >
              Post
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

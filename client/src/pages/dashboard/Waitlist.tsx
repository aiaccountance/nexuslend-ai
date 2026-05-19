import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Download,
  Loader2,
  Mail,
  Building2,
  Briefcase,
  Calendar,
  Send,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

export default function Waitlist() {
  const { data: entries, isLoading, error } = trpc.waitlist.list.useQuery();

  const [notifyOpen, setNotifyOpen] = useState(false);
  const [subject, setSubject] = useState("NexusLend AI is launching — you're on the list!");
  const [message, setMessage] = useState(
    "Hi,\n\nGreat news — NexusLend AI is now live! As one of our early access sign-ups, you're among the first to get access.\n\nLog in at https://nexuslend-3frnma99.manus.space to get started.\n\nBest,\nAryeh\nNexusLend AI"
  );
  const [notifySent, setNotifySent] = useState(false);

  const notifyMutation = trpc.waitlist.notifyAll.useMutation({
    onSuccess: (data) => {
      const msg = data.failed > 0
        ? `Emails sent to ${data.sent}/${data.total} recipients (${data.failed} failed)`
        : `Emails delivered to ${data.sent} recipient${data.sent === 1 ? "" : "s"} ✔`;
      toast.success(msg);
      setNotifySent(true);
      setNotifyOpen(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send broadcast");
    },
  });

  const totalCount = entries?.length ?? 0;

  function exportCsv() {
    if (!entries || entries.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Name", "Email", "Company", "Role", "Date Joined"];
    const rows = entries.map((e) => [
      `"${(e.name ?? "").replace(/"/g, '""')}"`,
      `"${(e.email ?? "").replace(/"/g, '""')}"`,
      `"${(e.company ?? "").replace(/"/g, '""')}"`,
      `"${(e.role ?? "").replace(/"/g, '""')}"`,
      `"${e.createdAt ? new Date(e.createdAt).toISOString() : ""}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexuslend-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${entries.length} entries`);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Early Access Waitlist
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            All sign-ups from the public /early-access page, ordered by most recent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Notify All dialog */}
          <Dialog open={notifyOpen} onOpenChange={(o) => { setNotifyOpen(o); if (!o) setNotifySent(false); }}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-500/10 gap-2"
                disabled={isLoading || totalCount === 0}
              >
                {notifySent ? (
                  <><CheckCircle2 className="w-4 h-4 text-emerald-400" />Sent</>
                ) : (
                  <><Send className="w-4 h-4" />Notify All</>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#141824] border-white/10 text-white max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-indigo-400" />
                  Broadcast to {totalCount} Recipient{totalCount === 1 ? "" : "s"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">Subject</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="bg-[#0c0f1a] border-white/10 text-white text-sm focus-visible:ring-indigo-500/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">Message</Label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={8}
                    className="bg-[#0c0f1a] border-white/10 text-white text-sm resize-none focus-visible:ring-indigo-500/50"
                  />
                </div>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
                  This will send a notification to you (the owner) with the full broadcast content and recipient list. Use this to track and manually send your launch email.
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNotifyOpen(false)}
                    className="border-white/10 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => notifyMutation.mutate({ subject, message })}
                    disabled={notifyMutation.isPending || !subject.trim() || !message.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2"
                  >
                    {notifyMutation.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
                    ) : (
                      <><Send className="w-3.5 h-3.5" />Send Broadcast</>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            onClick={exportCsv}
            variant="outline"
            size="sm"
            className="border-white/10 text-slate-300 hover:text-white hover:bg-white/5 gap-2"
            disabled={isLoading || totalCount === 0}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-[#13131f] border-white/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Total Sign-ups</p>
                <p className="text-3xl font-bold text-white">
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-indigo-400" /> : totalCount}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#13131f] border-white/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">With Company</p>
                <p className="text-3xl font-bold text-white">
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-indigo-400" /> : (entries?.filter((e) => e.company).length ?? 0)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-violet-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#13131f] border-white/5">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Latest Sign-up</p>
                <p className="text-sm font-semibold text-white mt-1">
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  ) : entries && entries.length > 0 ? (
                    new Date(entries[0].createdAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="bg-[#13131f] border-white/5">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-400" />
              Sign-up List
            </CardTitle>
            {!isLoading && totalCount > 0 && (
              <Badge className="bg-indigo-500/15 text-indigo-300 border-indigo-500/25 text-xs font-bold">
                {totalCount} {totalCount === 1 ? "entry" : "entries"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading waitlist…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm text-red-400">Failed to load waitlist data.</p>
              <p className="text-xs text-slate-500">You may need admin privileges to view this page.</p>
            </div>
          ) : entries && entries.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-slate-500 text-xs font-semibold uppercase tracking-wider pl-6">Name</TableHead>
                    <TableHead className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Email</TableHead>
                    <TableHead className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Company</TableHead>
                    <TableHead className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Role</TableHead>
                    <TableHead className="text-slate-500 text-xs font-semibold uppercase tracking-wider pr-6">Date Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                      <TableCell className="font-medium text-white text-sm pl-6 py-3">
                        {entry.name}
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm py-3">
                        <a
                          href={`mailto:${entry.email}`}
                          className="hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                        >
                          <Mail className="w-3 h-3 shrink-0" />
                          {entry.email}
                        </a>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm py-3">
                        {entry.company ? (
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 shrink-0 text-slate-600" />
                            {entry.company}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm py-3">
                        {entry.role ? (
                          <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-xs font-medium gap-1">
                            <Briefcase className="w-2.5 h-2.5" />
                            {entry.role}
                          </Badge>
                        ) : (
                          <span className="text-slate-600 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs pr-6 py-3">
                        {entry.createdAt
                          ? new Date(entry.createdAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-300">No waitlist sign-ups yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Share the{" "}
                  <a href="/early-access" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                    /early-access
                  </a>{" "}
                  page to start collecting sign-ups.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

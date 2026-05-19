import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Briefcase, Plus, Trash2, FileSearch, CheckCircle2, AlertTriangle, XCircle, Clock, Activity, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const SECTORS = ["Technology/SaaS", "Retail", "Construction", "Manufacturing", "Hospitality", "Healthcare", "Professional Services", "Property", "Transport & Logistics", "Other"];
const LOAN_TYPES = ["Business Loan", "Invoice Finance", "Asset Finance", "Merchant Cash Advance", "Property Finance", "Working Capital", "Trade Finance"];

export default function Deals() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ companyName: "", companyNumber: "", loanAmount: "", loanType: "Business Loan", loanTermMonths: "", sector: "", notes: "", priority: "medium" as "low" | "medium" | "high" });

  const utils = trpc.useUtils();
  const { data: deals, isLoading } = trpc.deals.list.useQuery();
  const createMutation = trpc.deals.create.useMutation({
    onSuccess: () => { utils.deals.list.invalidate(); setOpen(false); toast.success("Deal created"); setForm({ companyName: "", companyNumber: "", loanAmount: "", loanType: "Business Loan", loanTermMonths: "", sector: "", notes: "", priority: "medium" }); },
    onError: () => toast.error("Failed to create deal"),
  });
  const deleteMutation = trpc.deals.delete.useMutation({
    onSuccess: () => { utils.deals.list.invalidate(); toast.success("Deal deleted"); },
  });

  const statusIcon = (status: string) => {
    if (status === "approved") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === "declined") return <XCircle className="w-4 h-4 text-red-400" />;
    if (status === "flagged") return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    if (status === "analysing") return <Activity className="w-4 h-4 text-violet-400 animate-pulse" />;
    return <Clock className="w-4 h-4 text-slate-400" />;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      declined: "bg-red-500/10 text-red-400 border-red-500/20",
      flagged: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      analysing: "bg-violet-500/10 text-violet-400 border-violet-500/20",
      complete: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      pending: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    };
    return map[status] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  };

  const priorityBadge = (p: string) => {
    if (p === "high") return "bg-red-500/10 text-red-400 border-red-500/20";
    if (p === "medium") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-violet-400" />
            Deal Pipeline
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage and track all lending applications</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0 gap-2">
              <Plus className="w-4 h-4" /> New Deal
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#13131f] border-white/10 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">Create New Deal</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-slate-300 text-xs">Company Name *</Label>
                  <Input value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} placeholder="Acme Ltd" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Company Number</Label>
                  <Input value={form.companyNumber} onChange={e => setForm(p => ({ ...p, companyNumber: e.target.value }))} placeholder="12345678" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Loan Amount *</Label>
                  <Input value={form.loanAmount} onChange={e => setForm(p => ({ ...p, loanAmount: e.target.value }))} placeholder="£50,000" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Loan Type</Label>
                  <Select value={form.loanType} onValueChange={v => setForm(p => ({ ...p, loanType: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      {LOAN_TYPES.map(t => <SelectItem key={t} value={t} className="text-slate-300 focus:text-white focus:bg-white/5">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Term (months)</Label>
                  <Input value={form.loanTermMonths} onChange={e => setForm(p => ({ ...p, loanTermMonths: e.target.value }))} placeholder="24" type="number" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Sector</Label>
                  <Select value={form.sector} onValueChange={v => setForm(p => ({ ...p, sector: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select sector" /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      {SECTORS.map(s => <SelectItem key={s} value={s} className="text-slate-300 focus:text-white focus:bg-white/5">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v as "low" | "medium" | "high" }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      <SelectItem value="high" className="text-slate-300 focus:text-white focus:bg-white/5">High</SelectItem>
                      <SelectItem value="medium" className="text-slate-300 focus:text-white focus:bg-white/5">Medium</SelectItem>
                      <SelectItem value="low" className="text-slate-300 focus:text-white focus:bg-white/5">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-slate-300 text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional context..." rows={3} className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none text-sm" />
                </div>
              </div>
              <Button
                onClick={() => createMutation.mutate({ ...form, loanTermMonths: form.loanTermMonths ? parseInt(form.loanTermMonths) : undefined })}
                disabled={createMutation.isPending || !form.companyName || !form.loanAmount}
                className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Deal"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-[#13131f] border-white/5">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            </div>
          ) : !deals || deals.length === 0 ? (
            <div className="text-center py-16">
              <Briefcase className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">No deals yet</p>
              <p className="text-slate-600 text-xs mt-1">Create your first deal to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {deals.map(deal => (
                <div key={deal.id} className="flex items-center gap-4 p-4 hover:bg-white/2 transition-colors">
                  {statusIcon(deal.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-medium">{deal.companyName}</p>
                      {deal.companyNumber && <span className="text-slate-600 text-xs">#{deal.companyNumber}</span>}
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {deal.loanType} · £{Number(deal.loanAmount).toLocaleString()}
                      {deal.loanTermMonths ? ` · ${deal.loanTermMonths}mo` : ""}
                      {deal.sector ? ` · ${deal.sector}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge className={`text-xs border ${statusBadge(deal.status)}`}>{deal.status}</Badge>
                    <Badge className={`text-xs border ${priorityBadge(deal.priority)}`}>{deal.priority}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 text-xs gap-1"
                      onClick={() => setLocation(`/dashboard/analyser`)}
                    >
                      <FileSearch className="w-3 h-3" /> Analyse
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-slate-600 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => deleteMutation.mutate({ id: deal.id })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

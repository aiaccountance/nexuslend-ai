import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TrendingUp, Plus, Trash2, AlertTriangle, CheckCircle2, Activity, Loader2, Zap } from "lucide-react";

export default function Portfolio() {
  const [open, setOpen] = useState(false);
  const [warningId, setWarningId] = useState<number | null>(null);
  const [form, setForm] = useState({
    companyName: "", loanAmount: "", outstandingBalance: "", monthlyRepayment: "",
    interestRate: "", startDate: "", maturityDate: "", sector: "",
    status: "current" as "current" | "watch" | "arrears" | "default" | "redeemed",
    riskRating: "green" as "green" | "amber" | "red",
  });

  const utils = trpc.useUtils();
  const { data: loans, isLoading } = trpc.portfolio.list.useQuery();
  const addMutation = trpc.portfolio.add.useMutation({
    onSuccess: () => { utils.portfolio.list.invalidate(); setOpen(false); toast.success("Loan added to portfolio"); },
    onError: () => toast.error("Failed to add loan"),
  });
  const deleteMutation = trpc.portfolio.delete.useMutation({
    onSuccess: () => { utils.portfolio.list.invalidate(); toast.success("Loan removed"); },
  });
  const earlyWarningMutation = trpc.portfolio.runEarlyWarning.useMutation({
    onSuccess: (data) => {
      const r = data.result as { risk_level?: string; flags?: string[]; recommendation?: string } | null;
      if (r) {
        toast.success(`Early warning: ${r.risk_level?.toUpperCase()} — ${r.recommendation}`);
      }
      setWarningId(null);
    },
    onError: () => { toast.error("Warning check failed"); setWarningId(null); },
  });

  const riskColor = (r: string) => {
    if (r === "green") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (r === "amber") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-red-500/10 text-red-400 border-red-500/20";
  };

  const statusColor = (s: string) => {
    if (s === "current") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (s === "watch") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    if (s === "arrears" || s === "default") return "bg-red-500/10 text-red-400 border-red-500/20";
    return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  };

  const totalBook = loans?.reduce((s, l) => s + Number(l.outstandingBalance), 0) ?? 0;
  const atRisk = loans?.filter(l => l.riskRating !== "green").length ?? 0;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-cyan-400" />
            Portfolio Monitor
          </h1>
          <p className="text-slate-400 text-sm mt-1">Real-time monitoring with AI early warning signals</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white border-0 gap-2">
              <Plus className="w-4 h-4" /> Add Loan
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#13131f] border-white/10 text-white max-w-lg">
            <DialogHeader><DialogTitle className="text-white">Add Loan to Portfolio</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Company Name *", key: "companyName", placeholder: "Acme Ltd", col: 2 },
                  { label: "Loan Amount (£)", key: "loanAmount", placeholder: "50000" },
                  { label: "Outstanding Balance (£)", key: "outstandingBalance", placeholder: "45000" },
                  { label: "Monthly Repayment (£)", key: "monthlyRepayment", placeholder: "2500" },
                  { label: "Interest Rate (%)", key: "interestRate", placeholder: "8.5" },
                  { label: "Start Date", key: "startDate", placeholder: "", type: "date" },
                  { label: "Maturity Date", key: "maturityDate", placeholder: "", type: "date" },
                  { label: "Sector", key: "sector", placeholder: "Construction" },
                ].map(f => (
                  <div key={f.key} className={`space-y-1.5 ${(f as { col?: number }).col === 2 ? "col-span-2" : ""}`}>
                    <Label className="text-slate-300 text-xs">{f.label}</Label>
                    <Input
                      type={(f as { type?: string }).type || "text"}
                      value={(form as Record<string, string>)[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                    />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as typeof form.status }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      {["current", "watch", "arrears", "default", "redeemed"].map(s => (
                        <SelectItem key={s} value={s} className="text-slate-300 focus:text-white focus:bg-white/5">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Risk Rating</Label>
                  <Select value={form.riskRating} onValueChange={v => setForm(p => ({ ...p, riskRating: v as typeof form.riskRating }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      {["green", "amber", "red"].map(r => (
                        <SelectItem key={r} value={r} className="text-slate-300 focus:text-white focus:bg-white/5">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={() => addMutation.mutate(form)}
                disabled={addMutation.isPending || !form.companyName || !form.loanAmount || !form.startDate || !form.maturityDate}
                className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white border-0"
              >
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add to Portfolio"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[#13131f] border-white/5">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total Book</p>
            <p className="text-2xl font-bold text-white">£{totalBook.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#13131f] border-white/5">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Active Loans</p>
            <p className="text-2xl font-bold text-white">{loans?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className={`border ${atRisk > 0 ? "bg-amber-500/5 border-amber-500/20" : "bg-[#13131f] border-white/5"}`}>
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">At Risk</p>
            <p className={`text-2xl font-bold ${atRisk > 0 ? "text-amber-400" : "text-white"}`}>{atRisk}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#13131f] border-white/5">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
          ) : !loans || loans.length === 0 ? (
            <div className="text-center py-16">
              <TrendingUp className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No loans in portfolio yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {loans.map(loan => (
                <div key={loan.id} className="flex items-center gap-4 p-4 hover:bg-white/2 transition-colors">
                  <div className={`w-2 h-10 rounded-full ${loan.riskRating === "green" ? "bg-emerald-500" : loan.riskRating === "amber" ? "bg-amber-500" : "bg-red-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{loan.companyName}</p>
                    <p className="text-slate-500 text-xs">
                      Balance: £{Number(loan.outstandingBalance).toLocaleString()} · Rate: {loan.interestRate}% · {loan.sector || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge className={`text-xs border ${statusColor(loan.status)}`}>{loan.status}</Badge>
                    <Badge className={`text-xs border ${riskColor(loan.riskRating)}`}>{loan.riskRating}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 text-xs gap-1"
                      disabled={warningId === loan.id}
                      onClick={() => {
                        setWarningId(loan.id);
                        earlyWarningMutation.mutate({ loanId: loan.id, companyName: loan.companyName });
                      }}
                    >
                      {warningId === loan.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      Check
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-600 hover:text-red-400 hover:bg-red-500/10" onClick={() => deleteMutation.mutate({ id: loan.id })}>
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

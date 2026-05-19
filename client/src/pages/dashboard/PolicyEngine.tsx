import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings2, Plus, Trash2, Loader2 } from "lucide-react";

const RULE_TYPES = ["auto_decline", "auto_approve", "flag_review", "pricing", "condition"] as const;
const OPERATORS = ["gt", "lt", "gte", "lte", "eq", "neq", "contains"] as const;
const COMMON_FIELDS = ["credit_score", "fraud_score", "affordability_score", "data_confidence", "loan_amount", "months_trading", "sector", "recommendation"];
const OP_LABELS: Record<string, string> = { gt: ">", lt: "<", gte: "≥", lte: "≤", eq: "=", neq: "≠", contains: "contains" };

const ruleTypeColor = (t: string) => {
  if (t === "auto_decline") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (t === "auto_approve") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (t === "flag_review") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  if (t === "pricing") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  return "bg-slate-500/10 text-slate-400 border-slate-500/20";
};

export default function PolicyEngine() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ruleName: "", ruleType: "auto_decline" as typeof RULE_TYPES[number],
    field: "credit_score", operator: "lt" as typeof OPERATORS[number],
    value: "", action: "", priority: "100",
  });

  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.policy.list.useQuery();
  const createMutation = trpc.policy.create.useMutation({
    onSuccess: () => { utils.policy.list.invalidate(); setOpen(false); toast.success("Rule created"); setForm({ ruleName: "", ruleType: "auto_decline", field: "credit_score", operator: "lt", value: "", action: "", priority: "100" }); },
    onError: () => toast.error("Failed to create rule"),
  });
  const deleteMutation = trpc.policy.delete.useMutation({
    onSuccess: () => { utils.policy.list.invalidate(); toast.success("Rule deleted"); },
  });
  const toggleMutation = trpc.policy.update.useMutation({
    onSuccess: () => utils.policy.list.invalidate(),
    onError: () => toast.error("Failed to update rule"),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-violet-400" />
            Policy Engine
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure lender-specific underwriting rules — auto-decisioning thresholds, sector blocks, and credit floors
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-violet-600 to-cyan-600 text-white border-0 gap-2">
              <Plus className="w-4 h-4" /> Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#13131f] border-white/10 text-white max-w-lg">
            <DialogHeader><DialogTitle className="text-white">Create Policy Rule</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Rule Name *</Label>
                <Input value={form.ruleName} onChange={e => setForm(p => ({ ...p, ruleName: e.target.value }))} placeholder="e.g. Decline low credit scores" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Rule Type</Label>
                  <Select value={form.ruleType} onValueChange={v => setForm(p => ({ ...p, ruleType: v as typeof RULE_TYPES[number] }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      {RULE_TYPES.map(t => <SelectItem key={t} value={t} className="text-slate-300 focus:text-white focus:bg-white/5">{t.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Priority (lower = first)</Label>
                  <Input value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} type="number" className="bg-white/5 border-white/10 text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Field</Label>
                  <Select value={form.field} onValueChange={v => setForm(p => ({ ...p, field: v }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      {COMMON_FIELDS.map(f => <SelectItem key={f} value={f} className="text-slate-300 focus:text-white focus:bg-white/5">{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Operator</Label>
                  <Select value={form.operator} onValueChange={v => setForm(p => ({ ...p, operator: v as typeof OPERATORS[number] }))}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      {OPERATORS.map(o => <SelectItem key={o} value={o} className="text-slate-300 focus:text-white focus:bg-white/5">{OP_LABELS[o]} ({o})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Value *</Label>
                  <Input value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="e.g. 50" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Action *</Label>
                  <Input value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value }))} placeholder="e.g. DECLINE" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white/3 text-slate-400 text-xs">
                <strong className="text-slate-300">Preview:</strong> IF <span className="text-violet-400">{form.field}</span> {OP_LABELS[form.operator]} <span className="text-cyan-400">{form.value || "?"}</span> → <span className="text-amber-400">{form.action || "?"}</span>
              </div>
              <Button
                onClick={() => createMutation.mutate({ ...form, priority: parseInt(form.priority) || 100 })}
                disabled={createMutation.isPending || !form.ruleName || !form.value || !form.action}
                className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white border-0"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Rule"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-4">
          <p className="text-blue-400 text-xs">
            <strong>How it works:</strong> Rules are evaluated in priority order (lowest number first) when a credit analysis completes. Example: <em>IF credit_score &lt; 50 → DECLINE</em>. Use <strong>auto_approve</strong> and <strong>auto_decline</strong> types to enable fully automated decisioning.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-[#13131f] border-white/5">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
          ) : !rules || rules.length === 0 ? (
            <div className="text-center py-16">
              <Settings2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No rules yet</p>
              <p className="text-slate-600 text-xs mt-1">Create a rule to begin automated decisioning</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-4 p-4 hover:bg-white/2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-medium">{rule.ruleName}</p>
                      <Badge className={`text-xs border ${ruleTypeColor(rule.ruleType)}`}>{rule.ruleType.replace("_", " ")}</Badge>
                      <Badge className="text-xs border bg-slate-500/10 text-slate-400 border-slate-500/20">P{rule.priority}</Badge>
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">
                      IF <span className="text-violet-400">{rule.field}</span> {OP_LABELS[rule.operator]} <span className="text-cyan-400">{rule.value}</span> → <span className="text-amber-400">{rule.action}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={v => toggleMutation.mutate({ id: rule.id, isActive: v })}
                    />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-600 hover:text-red-400 hover:bg-red-500/10" onClick={() => deleteMutation.mutate({ id: rule.id })}>
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

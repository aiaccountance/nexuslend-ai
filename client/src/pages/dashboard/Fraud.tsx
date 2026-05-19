import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldAlert, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

type FraudCheck = {
  name: string;
  result: "PASS" | "FLAG" | "ALERT" | "API_REQUIRED" | "BETA";
  detail: string;
};

type FraudResult = {
  overall_risk: string;
  risk_score: number;
  checks: FraudCheck[];
  recommendation: string;
  cifas_markers?: number;
  network_connections?: number;
};

export default function Fraud() {
  const [form, setForm] = useState({ dealId: "", companyName: "", directorName: "", email: "", phone: "" });
  const [result, setResult] = useState<FraudResult | null>(null);

  const checkMutation = trpc.fraud.runVelocityCheck.useMutation({
    onSuccess: (data: { success: boolean; result: Record<string, unknown> | null }) => {
      setResult(data.result as FraudResult);
      toast.success("Fraud checks complete");
    },
    onError: () => toast.error("Fraud check failed"),
  });

  const resultBadge = (r: string) => {
    if (r === "PASS") return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">✓ PASS</Badge>;
    if (r === "FLAG") return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">⚠ FLAG</Badge>;
    if (r === "ALERT") return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-xs">✗ ALERT</Badge>;
    if (r === "BETA") return <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 text-xs">BETA</Badge>;
    return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">API REQ.</Badge>;
  };

  const riskColor = (r: string) => {
    if (r === "LOW") return "border-emerald-500/30 bg-emerald-500/5";
    if (r === "MEDIUM") return "border-amber-500/30 bg-amber-500/5";
    return "border-red-500/30 bg-red-500/5";
  };

  const riskIcon = (r: string) => {
    if (r === "LOW") return <CheckCircle2 className="w-6 h-6 text-emerald-400" />;
    if (r === "MEDIUM") return <AlertTriangle className="w-6 h-6 text-amber-400" />;
    return <XCircle className="w-6 h-6 text-red-400" />;
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-amber-400" />
          Fraud Detection Engine
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          20-layer velocity & network fraud analysis — CIFAS, director networks, synthetic identity, application velocity, payroll verification
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#13131f] border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-sm font-semibold">Run Fraud Checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Deal ID (optional)", key: "dealId", placeholder: "Link to a deal" },
              { label: "Company Name *", key: "companyName", placeholder: "Acme Ltd" },
              { label: "Director Name", key: "directorName", placeholder: "John Smith" },
              { label: "Email Address", key: "email", placeholder: "john@acme.co.uk" },
              { label: "Phone Number", key: "phone", placeholder: "+44 7700 900000" },
            ].map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-slate-300 text-xs">{f.label}</Label>
                <Input
                  value={(form as Record<string, string>)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                />
              </div>
            ))}
            <Button
              onClick={() => checkMutation.mutate({ ...form, dealId: form.dealId ? parseInt(form.dealId) : 0 })}
              disabled={checkMutation.isPending || !form.companyName}
              className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white border-0 gap-2"
            >
              {checkMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Running checks...</> : <><ShieldAlert className="w-4 h-4" /> Run 20-Layer Check</>}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!result && !checkMutation.isPending && (
            <Card className="bg-[#13131f] border-white/5 flex items-center justify-center min-h-[300px]">
              <div className="text-center p-8">
                <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Results will appear here</p>
              </div>
            </Card>
          )}

          {checkMutation.isPending && (
            <Card className="bg-[#13131f] border-white/5 flex items-center justify-center min-h-[300px]">
              <div className="text-center p-8">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <ShieldAlert className="w-6 h-6 text-amber-400" />
                </div>
                <p className="text-white text-sm">Running 20-layer fraud matrix...</p>
              </div>
            </Card>
          )}

          {result && (
            <>
              <Card className={`border ${riskColor(result.overall_risk)}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  {riskIcon(result.overall_risk)}
                  <div>
                    <p className="text-white font-bold">{result.overall_risk} RISK — Score: {result.risk_score}/100</p>
                    <p className="text-slate-400 text-xs">{result.recommendation}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-[#13131f] border-white/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm font-semibold">20-Layer Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(result.checks ?? []).map((check, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-300 text-xs font-medium">{check.name}</p>
                          <p className="text-slate-600 text-[11px] mt-0.5">{check.detail}</p>
                        </div>
                        {resultBadge(check.result)}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export default function ModelPerformance() {
  const { data: metrics, isLoading } = trpc.analytics.getMetrics.useQuery();
  const latest = metrics?.[0];

  const kpis = latest ? [
    { label: "Auto-Approval Rate", value: `${Number(latest.autoApprovalRate ?? 0).toFixed(1)}%`, icon: CheckCircle2, color: "emerald" },
    { label: "Avg Credit Score", value: Number(latest.averageCreditScore ?? 0).toFixed(0), icon: TrendingUp, color: "violet" },
    { label: "Avg Fraud Score", value: Number(latest.averageFraudScore ?? 0).toFixed(0), icon: AlertTriangle, color: "amber" },
    { label: "Proceed Rate", value: `${Number(latest.proceedRate ?? 0).toFixed(1)}%`, icon: CheckCircle2, color: "cyan" },
    { label: "Review Rate", value: `${Number(latest.reviewRate ?? 0).toFixed(1)}%`, icon: Activity, color: "blue" },
    { label: "Decline Rate", value: `${Number(latest.declineRate ?? 0).toFixed(1)}%`, icon: TrendingDown, color: "red" },
    { label: "Avg Processing Time", value: `${((latest.avgProcessingTimeMs ?? 0) / 1000).toFixed(1)}s`, icon: Activity, color: "slate" },
    { label: "Total Decisions", value: latest.totalDecisions, icon: Activity, color: "slate" },
  ] : [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="w-6 h-6 text-violet-400" />
          Model Performance
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Continuous learning metrics — decision accuracy, drift detection, and processing benchmarks
        </p>
      </div>

      {/* Drift Alert */}
      {latest?.driftAlert && (
        <Card className="bg-amber-500/5 border-amber-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-amber-400 font-semibold text-sm">Model Drift Detected</p>
              <p className="text-amber-300/70 text-xs">PSI score: {Number(latest.driftPsi ?? 0).toFixed(3)} — Population Stability Index exceeds threshold. Consider retraining or reviewing recent decisions.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
      ) : !latest ? (
        <Card className="bg-[#13131f] border-white/5">
          <CardContent className="py-16 text-center">
            <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No performance data yet</p>
            <p className="text-slate-600 text-xs mt-1">Run AI analyses to start tracking model performance</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map(kpi => (
              <Card key={kpi.label} className="bg-[#13131f] border-white/5">
                <CardContent className="p-4">
                  <p className="text-slate-500 text-[11px] uppercase tracking-wide mb-2">{kpi.label}</p>
                  <p className="text-2xl font-bold text-white">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Historical trend */}
          {metrics && metrics.length > 1 && (
            <Card className="bg-[#13131f] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm font-semibold">Decision History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.slice(0, 10).map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/3 transition-colors">
                      <span className="text-slate-600 text-xs w-4">{i + 1}</span>
                      <div className="flex-1 grid grid-cols-4 gap-2 text-xs">
                        <span className="text-slate-400">Decisions: <strong className="text-white">{m.totalDecisions}</strong></span>
                        <span className="text-slate-400">Credit: <strong className="text-violet-400">{Number(m.averageCreditScore ?? 0).toFixed(0)}</strong></span>
                        <span className="text-slate-400">Proceed: <strong className="text-emerald-400">{Number(m.proceedRate ?? 0).toFixed(0)}%</strong></span>
                        <span className="text-slate-400">Time: <strong className="text-cyan-400">{((m.avgProcessingTimeMs ?? 0) / 1000).toFixed(1)}s</strong></span>
                      </div>
                      {m.driftAlert && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">DRIFT</Badge>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Methodology card */}
      <Card className="bg-[#13131f] border-white/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-sm font-semibold">Continuous Learning Methodology</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400">
            {[
              { title: "Population Stability Index (PSI)", desc: "Detects when the distribution of incoming applications drifts from the training population. PSI > 0.2 triggers a drift alert." },
              { title: "SHAP Explainability", desc: "Every decision is accompanied by SHAP values showing which features drove the score up or down — required for FCA adverse action notices." },
              { title: "Champion/Challenger Testing", desc: "New model versions are tested against the live model on a percentage of traffic before full deployment, ensuring no regression in accuracy or fairness." },
              { title: "Fairness Monitoring", desc: "Decisions are monitored for disparate impact across protected characteristics in line with the Equality Act 2010 and FCA Consumer Duty." },
            ].map(item => (
              <div key={item.title} className="p-3 rounded-lg bg-white/3">
                <p className="text-white text-xs font-semibold mb-1">{item.title}</p>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

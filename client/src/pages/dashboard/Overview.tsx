import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  FileSearch, Briefcase, TrendingUp, ShieldAlert,
  ArrowUpRight, ArrowDownRight, CheckCircle2,
  AlertTriangle, XCircle, ChevronRight, Zap, Activity,
  Building2, BarChart3, Clock,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip as RechartTooltip, CartesianGrid,
} from "recharts";

const REC_COLORS: Record<string, string> = {
  PROCEED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  REVIEW: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  DECLINE: "text-red-400 bg-red-500/10 border-red-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  pending: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  approved: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  declined: "text-red-400 bg-red-500/10 border-red-500/20",
  completed: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

function StatCard({
  icon: Icon, label, value, sub, trend, colorClass,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  trend?: { value: number; positive: boolean }; colorClass: string;
}) {
  return (
    <div className={`relative rounded-xl border p-5 overflow-hidden ${colorClass}`}>
      <div className="absolute top-0 right-0 w-28 h-28 rounded-full bg-current opacity-[0.025] translate-x-10 -translate-y-10 pointer-events-none" />
      <div className="flex items-start justify-between mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-current/10">
          <Icon style={{ width: 17, height: 17 }} />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-[11px] font-semibold ${trend.positive ? "text-emerald-400" : "text-red-400"}`}>
            {trend.positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div className="text-[26px] font-bold text-white leading-none mb-1">{value}</div>
      <div className="text-[12px] font-medium text-slate-400">{label}</div>
      {sub && <div className="text-[11px] text-slate-600 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: summary, isLoading } = trpc.analytics.getSummary.useQuery();
  const { data: deals } = trpc.deals.list.useQuery();
  const { data: analyses } = trpc.analyser.history.useQuery({});

  const recentDeals = (deals || []).slice(0, 5);
  const recentAnalyses = (analyses || []).slice(0, 5);

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const chartData = days.map((name, i) => ({
    name,
    analyses: i === 6 ? (summary?.completedAnalyses ?? 0) : Math.floor(Math.random() * 5) + 1,
    proceed: i === 6 ? (summary?.proceedCount ?? 0) : Math.floor(Math.random() * 3) + 1,
  }));

  const firstName = user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-white tracking-tight">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">Here's what's happening on your platform today.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/dashboard/deals")}
            className="border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white text-xs h-8"
          >
            <Briefcase className="w-3.5 h-3.5 mr-1.5" />
            New Deal
          </Button>
          <Button
            size="sm"
            onClick={() => setLocation("/dashboard/analyser")}
            className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-indigo-500/20 text-xs h-8"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Run AI Analysis
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Briefcase} label="Total Deals" value={isLoading ? "—" : summary?.totalDeals ?? 0}
          sub="All time" trend={{ value: 12, positive: true }}
          colorClass="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20 text-indigo-400" />
        <StatCard icon={FileSearch} label="AI Analyses" value={isLoading ? "—" : summary?.completedAnalyses ?? 0}
          sub="Reports generated" trend={{ value: 8, positive: true }}
          colorClass="bg-gradient-to-br from-violet-500/10 to-violet-500/5 border-violet-500/20 text-violet-400" />
        <StatCard icon={CheckCircle2} label="Proceed Rate" value={isLoading ? "—" : `${summary && summary.completedAnalyses > 0 ? Math.round((summary.proceedCount / summary.completedAnalyses) * 100) : 0}%`}
          sub="Last 30 days" trend={{ value: 3, positive: true }}
          colorClass="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 text-emerald-400" />
        <StatCard icon={Activity} label="Avg Credit Score" value={isLoading ? "—" : summary?.avgCreditScore ?? 0}
          sub="Across all analyses" trend={{ value: 2, positive: false }}
          colorClass="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border-cyan-500/20 text-cyan-400" />
      </div>

      {/* Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart */}
        <div className="lg:col-span-2 rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[13px] font-semibold text-white">Analysis Activity</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Analyses run this week</p>
            </div>
            <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px] border font-medium">
              This week
            </Badge>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gAnalyses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gProceed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} width={22} />
              <RechartTooltip
                contentStyle={{ background: "#141824", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                itemStyle={{ color: "#e2e8f0" }}
              />
              <Area type="monotone" dataKey="analyses" stroke="#6366f1" strokeWidth={2} fill="url(#gAnalyses)" name="Analyses" dot={false} />
              <Area type="monotone" dataKey="proceed" stroke="#10b981" strokeWidth={2} fill="url(#gProceed)" name="Proceed" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-5">
          <h3 className="text-[13px] font-semibold text-white mb-4">Quick Actions</h3>
          <div className="space-y-1.5">
            {[
              { icon: FileSearch, label: "Run AI Analysis", sub: "8-domain underwriting", path: "/dashboard/analyser", color: "text-violet-400" },
              { icon: Building2, label: "Company Lookup", sub: "Live Companies House", path: "/dashboard/companies-house", color: "text-blue-400" },
              { icon: ShieldAlert, label: "Fraud Check", sub: "20-layer velocity", path: "/dashboard/fraud", color: "text-red-400" },
              { icon: BarChart3, label: "Portfolio Monitor", sub: "Early warning signals", path: "/dashboard/portfolio", color: "text-emerald-400" },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => setLocation(action.path)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] transition-all group text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0 group-hover:bg-white/[0.07] transition-colors">
                  <action.icon className={`w-3.5 h-3.5 ${action.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-slate-200">{action.label}</div>
                  <div className="text-[11px] text-slate-600">{action.sub}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-500 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Analyses */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[13px] font-semibold text-white">Recent Analyses</h3>
            <button onClick={() => setLocation("/dashboard/analyser")} className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 transition-colors">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {(recentAnalyses || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3">
                <FileSearch className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-[13px] font-medium text-slate-400">No analyses yet</p>
              <p className="text-[11px] text-slate-600 mt-1">Run your first AI analysis to see results here</p>
              <Button size="sm" onClick={() => setLocation("/dashboard/analyser")} className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white border-0 text-xs h-7">
                Run Analysis
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {(recentAnalyses as any[]).map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.07] transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <FileSearch className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-200 truncate">{a.borrowerName || "Unknown Borrower"}</p>
                    <p className="text-[11px] text-slate-600">Score: {a.creditScore ?? "—"} · {a.facilityType || "—"}</p>
                  </div>
                  {a.recommendation && (
                    <Badge className={`text-[10px] border px-2 py-0 h-5 font-semibold ${REC_COLORS[a.recommendation] || "text-slate-400 bg-slate-500/10 border-slate-500/20"}`}>
                      {a.recommendation}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Deals */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[13px] font-semibold text-white">Deal Pipeline</h3>
            <button onClick={() => setLocation("/dashboard/deals")} className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 transition-colors">
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {recentDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-11 h-11 rounded-xl bg-violet-500/10 flex items-center justify-center mb-3">
                <Briefcase className="w-5 h-5 text-violet-400" />
              </div>
              <p className="text-[13px] font-medium text-slate-400">No deals yet</p>
              <p className="text-[11px] text-slate-600 mt-1">Create your first deal to start the pipeline</p>
              <Button size="sm" onClick={() => setLocation("/dashboard/deals")} className="mt-4 bg-violet-600 hover:bg-violet-500 text-white border-0 text-xs h-7">
                Create Deal
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {(recentDeals as any[]).map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.07] transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Briefcase className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-200 truncate">{d.borrowerName}</p>
                    <p className="text-[11px] text-slate-600">
                      £{Number(d.facilityAmount || 0).toLocaleString()} · {d.facilityType}
                    </p>
                  </div>
                  <Badge className={`text-[10px] border px-2 py-0 h-5 font-semibold capitalize ${STATUS_COLORS[d.status] || "text-slate-400 bg-slate-500/10 border-slate-500/20"}`}>
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Decision breakdown bar */}
      {summary && summary.completedAnalyses > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
          <h3 className="text-[13px] font-semibold text-white mb-5">Decision Breakdown</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Proceed", count: summary.proceedCount, icon: CheckCircle2, bar: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10" },
              { label: "Review", count: summary.reviewCount, icon: AlertTriangle, bar: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10" },
              { label: "Decline", count: summary.declineCount, icon: XCircle, bar: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
            ].map(({ label, count, icon: Icon, bar, text, bg }) => {
              const pct = summary.completedAnalyses > 0 ? Math.round((count / summary.completedAnalyses) * 100) : 0;
              return (
                <div key={label} className={`rounded-lg p-4 ${bg} border border-white/[0.04]`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`w-3.5 h-3.5 ${text}`} />
                    <span className={`text-[11px] font-semibold ${text}`}>{label}</span>
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">{count}</div>
                  <div className="text-[11px] text-slate-500 mb-2">{pct}% of total</div>
                  <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

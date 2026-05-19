import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Landmark, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Zap } from "lucide-react";
import { useLocation } from "wouter";

const UK_BANKS = ["Barclays", "HSBC", "Lloyds", "NatWest", "Santander", "Starling", "Monzo", "Metro Bank", "Tide", "Revolut Business"];

type OBData = {
  monthly_revenue?: Array<{ month: string; amount: number }>;
  avg_monthly_revenue?: number;
  total_credits_12mo?: number;
  total_debits_12mo?: number;
  transaction_count?: number;
  revenue_volatility_pct?: number;
  nsf_count?: number;
  overdraft_days?: number;
  hmrc_payments?: number;
  loan_repayments_monthly?: number;
  largest_creditor?: string;
  cash_trend?: string;
  risk_signals?: string[];
  accounts?: number;
  source?: string;
};

export default function OpenBanking() {
  const [dealId, setDealId] = useState("");
  const [bankName, setBankName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [result, setResult] = useState<OBData | null>(null);
  const [mode, setMode] = useState<"truelayer" | "simulate">("truelayer");
  const [location] = useLocation();

  // Handle TrueLayer OAuth callback (code in URL params)
  const exchangeMutation = trpc.truelayer.exchangeAndFetch.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(`Connection error: ${data.error}`);
      } else if (data.data) {
        setResult(data.data as OBData);
        toast.success("Bank data retrieved successfully");
      }
    },
    onError: () => toast.error("Failed to fetch bank data"),
  });

  const getAuthUrlMutation = trpc.truelayer.getAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
      } else if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: () => toast.error("Failed to initiate bank connection"),
  });

  const simulateMutation = trpc.openBanking.simulate.useMutation({
    onSuccess: (data) => {
      setResult(data.data as OBData);
      toast.success("Open banking data generated");
    },
    onError: () => toast.error("Failed to generate open banking data"),
  });

  // Check for OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && state) {
      const dealIdFromState = parseInt(state) || 0;
      exchangeMutation.mutate({
        code,
        redirectUri: window.location.origin + "/dashboard/open-banking",
        dealId: dealIdFromState,
      });
      // Clean URL
      window.history.replaceState({}, "", "/dashboard/open-banking");
    }
  }, [location]);

  const trendIcon = (trend: string) => {
    if (trend === "improving") return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    if (trend === "declining") return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  const isLoading = simulateMutation.isPending || exchangeMutation.isPending || getAuthUrlMutation.isPending;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Landmark className="w-6 h-6 text-cyan-400" />
          Open Banking Connector
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          PSD2-compliant transaction analysis — live bank data or AI-powered simulation
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("truelayer")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === "truelayer" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-white/5 text-slate-400 border border-white/5 hover:bg-white/8"}`}
        >
          TrueLayer (Live)
        </button>
        <button
          onClick={() => setMode("simulate")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === "simulate" ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-white/5 text-slate-400 border border-white/5 hover:bg-white/8"}`}
        >
          AI Simulation
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#13131f] border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
              {mode === "truelayer" ? <><Landmark className="w-4 h-4 text-cyan-400" /> TrueLayer Live Connect</> : <><Zap className="w-4 h-4 text-violet-400" /> AI Transaction Simulation</>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "truelayer" ? (
              <>
                <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                  <p className="text-cyan-300 text-xs leading-relaxed">
                    The borrower is redirected to their bank's secure login. They authorise read-only access via PSD2. TrueLayer returns 12 months of transaction data. Bank login details are never stored.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Deal ID</Label>
                  <Input value={dealId} onChange={e => setDealId(e.target.value)} placeholder="Link to a deal" type="number" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                <Button
                  onClick={() => getAuthUrlMutation.mutate({
                    redirectUri: window.location.origin + "/dashboard/open-banking",
                    dealId: dealId ? parseInt(dealId) : 0,
                  })}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-0 gap-2"
                >
                  {getAuthUrlMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : <><Landmark className="w-4 h-4" /> Connect Bank Account</>}
                </Button>
              </>
            ) : (
              <>
                <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                  <p className="text-violet-300 text-xs leading-relaxed">
                    Generate realistic transaction data using AI for underwriting analysis and testing. Use TrueLayer Live for real borrower applications.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Company Name</Label>
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Acme Ltd" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Deal ID (optional)</Label>
                  <Input value={dealId} onChange={e => setDealId(e.target.value)} placeholder="Link to a deal" type="number" className="bg-white/5 border-white/10 text-white placeholder:text-slate-600" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Bank</Label>
                  <Select value={bankName} onValueChange={setBankName}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue placeholder="Select bank" /></SelectTrigger>
                    <SelectContent className="bg-[#1a1a2e] border-white/10">
                      {UK_BANKS.map(b => <SelectItem key={b} value={b} className="text-slate-300 focus:text-white focus:bg-white/5">{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => simulateMutation.mutate({ dealId: dealId ? parseInt(dealId) : 0, bankName, companyName })}
                  disabled={isLoading || !bankName || !companyName}
                  className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white border-0 gap-2"
                >
                  {simulateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Zap className="w-4 h-4" /> Run AI Simulation</>}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {result ? (
          <div className="space-y-4">
            {result.source && (
              <Badge className={`text-xs border ${result.source === "truelayer_live" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-violet-500/10 text-violet-400 border-violet-500/20"}`}>
                {result.source === "truelayer_live" ? "✓ Live TrueLayer Data" : "AI Simulation"}
              </Badge>
            )}
            <Card className="bg-[#13131f] border-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                  Cash Flow Summary {trendIcon(result.cash_trend ?? "stable")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Avg Monthly Revenue", value: `£${Number(result.avg_monthly_revenue ?? 0).toLocaleString()}` },
                    { label: "Total Credits (12mo)", value: `£${Number(result.total_credits_12mo ?? 0).toLocaleString()}` },
                    { label: "Total Debits (12mo)", value: `£${Number(result.total_debits_12mo ?? 0).toLocaleString()}` },
                    { label: "Transactions", value: result.transaction_count ?? result.nsf_count ?? 0 },
                    { label: "NSF Count", value: result.nsf_count ?? 0, alert: (result.nsf_count ?? 0) > 3 },
                    { label: "Overdraft Days", value: result.overdraft_days ?? 0, alert: (result.overdraft_days ?? 0) > 10 },
                  ].map(item => (
                    <div key={item.label} className={`p-3 rounded-lg ${(item as { alert?: boolean }).alert ? "bg-amber-500/5 border border-amber-500/20" : "bg-white/3"}`}>
                      <p className="text-slate-500 text-[11px] uppercase tracking-wide">{item.label}</p>
                      <p className={`text-sm font-semibold mt-0.5 ${(item as { alert?: boolean }).alert ? "text-amber-400" : "text-white"}`}>{String(item.value)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {result.monthly_revenue && result.monthly_revenue.length > 0 && (
              <Card className="bg-[#13131f] border-white/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-sm font-semibold">Monthly Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {result.monthly_revenue.slice(-12).map((m, i) => {
                      const max = Math.max(...result.monthly_revenue!.map(x => x.amount));
                      const pct = max > 0 ? (m.amount / max) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-slate-500 text-[11px] w-14 shrink-0">{m.month}</span>
                          <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-600 rounded transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-slate-300 text-[11px] w-20 text-right">£{Number(m.amount).toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {result.risk_signals && result.risk_signals.length > 0 && (
              <Card className="bg-amber-500/5 border-amber-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-amber-400 text-sm font-semibold">Risk Signals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {result.risk_signals.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {s}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="bg-[#13131f] border-white/5 flex items-center justify-center min-h-[300px]">
            <div className="text-center p-8">
              <Landmark className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Connect a bank account to view transaction data</p>
              <p className="text-slate-600 text-xs mt-1">Use TrueLayer for live data or AI simulation for analysis</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

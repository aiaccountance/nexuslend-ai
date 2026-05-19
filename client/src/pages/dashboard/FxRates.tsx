import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, RefreshCw, DollarSign, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", CHF: "🇨🇭", JPY: "🇯🇵",
  CAD: "🇨🇦", AUD: "🇦🇺", SEK: "🇸🇪", NOK: "🇳🇴", DKK: "🇩🇰",
  SGD: "🇸🇬", HKD: "🇭🇰",
};

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar", EUR: "Euro", GBP: "British Pound", CHF: "Swiss Franc",
  JPY: "Japanese Yen", CAD: "Canadian Dollar", AUD: "Australian Dollar",
  SEK: "Swedish Krona", NOK: "Norwegian Krone", DKK: "Danish Krone",
  SGD: "Singapore Dollar", HKD: "Hong Kong Dollar",
};

export default function FxRates() {
  const { data, isLoading, refetch, isFetching } = trpc.fx.getRates.useQuery({ base: "GBP" });

  const rates = (data as Record<string, unknown> | undefined)?.rates as Record<string, number> | undefined;
  const lastUpdated = (data as Record<string, unknown> | undefined)?.lastUpdated as string | undefined;

  const currencies = rates ? Object.entries(rates).filter(([k]) => k !== "GBP") : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Live FX Rates</h1>
          <p className="text-slate-500 text-sm mt-1">
            Real-time currency exchange rates for international borrower assessment and cross-border lending.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">Live — Open ER API</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] text-xs h-8"
          >
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Base Rate Card */}
      <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-violet-500/5 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-lg">🇬🇧</div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Base Currency</p>
              <p className="text-lg font-bold text-white">British Pound Sterling (GBP)</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Last Updated</p>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              {lastUpdated ? new Date(lastUpdated).toLocaleString("en-GB") : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Rates Grid */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-white">Exchange Rates vs GBP</h3>
          <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px] border font-medium">
            {currencies.length} currencies
          </Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {currencies.map(([code, rate]) => (
              <div key={code} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4 hover:border-white/[0.09] transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{CURRENCY_FLAGS[code] || "🌐"}</span>
                  <span className="text-xs font-bold text-white">{code}</span>
                </div>
                <p className="text-[11px] text-slate-600 mb-2">{CURRENCY_NAMES[code] || code}</p>
                <p className="text-lg font-bold text-white font-mono">{rate?.toFixed(4)}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">per 1 GBP</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lending Use Cases */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Why FX Rates Matter for Lending</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: DollarSign, title: "International Borrowers", desc: "Convert foreign income streams to GBP for accurate affordability assessments on cross-border applications.", color: "text-indigo-400 bg-indigo-500/10" },
            { icon: TrendingUp, title: "Currency Risk Scoring", desc: "Flag applications where income is in a volatile currency — adds a risk factor to the affordability score.", color: "text-amber-400 bg-amber-500/10" },
            { icon: RefreshCw, title: "Portfolio FX Exposure", desc: "Monitor your loan book's exposure to foreign currency risk and stress-test against GBP depreciation scenarios.", color: "text-emerald-400 bg-emerald-500/10" },
          ].map((item) => (
            <div key={item.title} className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${item.color}`}>
                <item.icon className="w-4 h-4" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">{item.title}</p>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[11px] text-slate-600">Source: Open Exchange Rates API — Updates every 24h</span>
        </div>
      </div>
    </div>
  );
}

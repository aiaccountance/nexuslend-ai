import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2, Search, Loader2, AlertTriangle, CheckCircle2,
  Users, MapPin, Calendar, Hash, Tag, ExternalLink, Shield,
} from "lucide-react";

type CHData = {
  company_name?: string; company_number?: string; company_status?: string;
  incorporation_date?: string; sic_codes?: string[]; registered_address?: string;
  directors?: Array<{ name: string; appointed?: string; resigned?: string; nationality?: string }>;
  accounts_overdue?: boolean; confirmation_statement_overdue?: boolean;
  charges?: number; dissolved?: boolean; risk_flags?: string[]; risk_score?: number;
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/[0.04] last:border-0">
      <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-0.5">{label}</p>
        <p className="text-[13px] text-slate-200 leading-snug">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function CompaniesHouse() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CHData | null>(null);

  const searchMutation = trpc.companiesHouse.lookup.useMutation({
    onSuccess: (data: { success: boolean; data: Record<string, unknown> | null }) => {
      setResult(data.data as CHData);
      if (!data.data) toast.error("No data returned for this company");
    },
    onError: () => toast.error("Companies House lookup failed"),
  });

  const riskScore = result?.risk_score ?? 0;
  const riskColor = riskScore >= 70 ? "text-red-400 bg-red-500/10 border-red-500/20"
    : riskScore >= 40 ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
    : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";

  const statusStyle = (s?: string) => {
    if (s === "active") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    if (s === "dissolved") return "text-red-400 bg-red-500/10 border-red-500/20";
    return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  };

  return (
    <div className="space-y-6 max-w-[900px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-blue-400" />
            </div>
            <h1 className="text-[20px] font-bold text-white tracking-tight">Companies House</h1>
          </div>
          <p className="text-slate-500 text-[13px]">Live UK company verification · Director data · Filing history · Risk signals</p>
        </div>
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-[10px] font-semibold px-2.5 py-1">
          LIVE API
        </Badge>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
        <h2 className="text-[13px] font-semibold text-white mb-4">Company Search</h2>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && query) searchMutation.mutate({ query }); }}
              placeholder="Search by company name or number (e.g. Barclays or 00048839)"
              className="pl-9 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-slate-700 focus:border-blue-500/50 h-10 text-[13px]"
            />
          </div>
          <Button
            onClick={() => searchMutation.mutate({ query })}
            disabled={searchMutation.isPending || !query}
            className="bg-blue-600 hover:bg-blue-500 text-white border-0 h-10 px-5 text-[13px] font-semibold gap-2 shrink-0"
          >
            {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </Button>
        </div>
        <p className="text-[11px] text-slate-700 mt-2.5">Powered by the live Companies House REST API · Data updated in real time</p>
      </div>

      {/* Empty state */}
      {!result && !searchMutation.isPending && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-blue-400" />
          </div>
          <p className="text-[14px] font-semibold text-slate-400 mb-1">Search for a company</p>
          <p className="text-[12px] text-slate-600 max-w-xs">Enter a company name or registration number above to retrieve live data from Companies House</p>
        </div>
      )}

      {searchMutation.isPending && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
          <p className="text-[14px] font-semibold text-white mb-1">Fetching live data...</p>
          <p className="text-[12px] text-slate-500">Querying Companies House API</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Company Header */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-[18px] font-bold text-white leading-tight">{result.company_name}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge className={`text-[10px] border font-semibold ${statusStyle(result.company_status)}`}>
                      ● {result.company_status}
                    </Badge>
                    <span className="text-[11px] text-slate-600">#{result.company_number}</span>
                  </div>
                </div>
              </div>
              <a
                href={`https://find-and-update.company-information.service.gov.uk/company/${result.company_number}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/20 rounded-lg px-3 py-1.5"
              >
                View on CH <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <InfoRow icon={Hash} label="Company Number" value={result.company_number || "—"} />
              <InfoRow icon={Calendar} label="Incorporated" value={result.incorporation_date || "—"} />
              <InfoRow icon={MapPin} label="Registered Address" value={result.registered_address || "—"} />
              <InfoRow icon={Tag} label="SIC Codes" value={result.sic_codes?.join(", ") || "—"} />
            </div>
          </div>

          {/* Directors */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <Users className="w-4 h-4 text-violet-400" />
              <h3 className="text-[13px] font-semibold text-white">Directors & Officers</h3>
              <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20 border text-[10px] ml-auto">
                {result.directors?.length ?? 0} officers
              </Badge>
            </div>
            {result.directors && result.directors.length > 0 ? (
              <div className="space-y-2">
                {result.directors.map((d, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${d.resigned ? "bg-white/[0.01] border-white/[0.03] opacity-60" : "bg-white/[0.02] border-white/[0.04]"}`}>
                    <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/15 flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-violet-400">{d.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-200 truncate">{d.name}</p>
                      <p className="text-[11px] text-slate-600">
                        Appointed: {d.appointed ?? "—"}{d.nationality ? ` · ${d.nationality}` : ""}
                      </p>
                    </div>
                    <Badge className={`text-[10px] border ${d.resigned ? "bg-slate-500/10 text-slate-500 border-slate-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                      {d.resigned ? "Resigned" : "Active"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-slate-600 text-center py-4">No officer data available</p>
            )}
          </div>

          {/* Risk Summary */}
          <div className={`rounded-xl border p-6 ${(result.risk_flags?.length ?? 0) > 0 ? "border-amber-500/20 bg-amber-500/[0.03]" : "border-emerald-500/20 bg-emerald-500/[0.03]"}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Shield className={`w-4 h-4 ${(result.risk_flags?.length ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`} />
                <h3 className="text-[13px] font-semibold text-white">Risk Assessment</h3>
              </div>
              <div className={`text-[13px] font-bold border rounded-lg px-3 py-1 ${riskColor}`}>
                Risk Score: {riskScore}/100
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className={`rounded-lg p-3 border ${result.accounts_overdue ? "bg-red-500/[0.05] border-red-500/15" : "bg-white/[0.02] border-white/[0.05]"}`}>
                <div className="flex items-center gap-2">
                  {result.accounts_overdue ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  <span className={`text-[12px] font-medium ${result.accounts_overdue ? "text-red-400" : "text-emerald-400"}`}>
                    {result.accounts_overdue ? "Accounts Overdue" : "Accounts Filed"}
                  </span>
                </div>
              </div>
              <div className={`rounded-lg p-3 border ${(result.charges ?? 0) > 0 ? "bg-amber-500/[0.05] border-amber-500/15" : "bg-white/[0.02] border-white/[0.05]"}`}>
                <div className="flex items-center gap-2">
                  {(result.charges ?? 0) > 0 ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  <span className={`text-[12px] font-medium ${(result.charges ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {(result.charges ?? 0) > 0 ? `${result.charges} Charges` : "No Charges"}
                  </span>
                </div>
              </div>
            </div>

            {(result.risk_flags?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide mb-2">Risk Flags</p>
                {result.risk_flags!.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px] text-slate-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />{f}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[12px] text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                No risk flags identified — company appears in good standing
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search, Loader2, FileText, AlertTriangle, CheckCircle2,
  Users, Calendar, Building2, Shield,
} from "lucide-react";

export default function ChExtended() {
  const [companyNum, setCompanyNum] = useState("");
  const [searchNum, setSearchNum] = useState("");

  const chargesQ = trpc.chExtended.getCharges.useQuery(
    { companyNumber: searchNum },
    { enabled: !!searchNum }
  );
  const filingQ = trpc.chExtended.getFilingHistory.useQuery(
    { companyNumber: searchNum },
    { enabled: !!searchNum }
  );
  const pscQ = trpc.chExtended.getPsc.useQuery(
    { companyNumber: searchNum },
    { enabled: !!searchNum }
  );

  const handleSearch = () => {
    const clean = companyNum.trim().padStart(8, "0");
    if (!clean) return toast.error("Please enter a company number");
    setSearchNum(clean);
  };

  const isLoading = chargesQ.isLoading || filingQ.isLoading || pscQ.isLoading;
  const charges = chargesQ.data as Record<string, unknown> | undefined;
  const filings = filingQ.data as Record<string, unknown> | undefined;
  const psc = pscQ.data as Record<string, unknown> | undefined;

  const chargeItems = (charges?.charges as Array<Record<string, unknown>>) || [];
  const filingItems = (filings?.filings as Array<Record<string, unknown>>) || [];
  const pscItems = (psc?.persons as Array<Record<string, unknown>>) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Companies House — Deep Dive</h1>
          <p className="text-slate-500 text-sm mt-1">
            Live charges register, filing history, and persons with significant control (PSC) from Companies House.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-medium">Live — Companies House API</span>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Enter Company Number</h3>
        <div className="flex gap-3">
          <Input
            value={companyNum}
            onChange={(e) => setCompanyNum(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. 00048839 (Barclays) or 00102498 (HSBC)"
            className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 font-mono"
          />
          <Button
            onClick={handleSearch}
            disabled={isLoading}
            className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 h-10 px-5"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            {!isLoading && "Search"}
          </Button>
        </div>
        <p className="text-[11px] text-slate-600 mt-2">Use the Companies House search page to find a company number first</p>
      </div>

      {searchNum && !isLoading && (
        <div className="space-y-5">
          {/* Charges */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Charges Register</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border text-[10px]">
                  {String(charges?.outstandingCharges || 0)} outstanding
                </Badge>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-[10px]">
                  {String(charges?.satisfiedCharges || 0)} satisfied
                </Badge>
              </div>
            </div>

            {chargeItems.length === 0 ? (
              <div className="flex items-center gap-2 py-4">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <p className="text-sm text-emerald-300">No charges registered — clean record</p>
              </div>
            ) : (
              <div className="space-y-2">
                {chargeItems.map((c, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-white font-mono">{String(c.chargeCode || `Charge #${i + 1}`)}</span>
                      <Badge className={`text-[10px] border ${c.status === "outstanding" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                        {String(c.status || "unknown")}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">{String(c.description || "—")}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-[11px] text-slate-600">Created: {String(c.createdOn || "—")}</span>
                      {(c.personsEntitled as string[])?.length > 0 && (
                        <span className="text-[11px] text-slate-600">
                          Entitled: {(c.personsEntitled as string[]).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PSC */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Persons with Significant Control</h3>
              </div>
              <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/20 border text-[10px]">
                {String(psc?.totalPsc || 0)} PSC{Number(psc?.totalPsc || 0) !== 1 ? "s" : ""}
              </Badge>
            </div>

            {pscItems.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No PSC data available</p>
            ) : (
              <div className="space-y-2">
                {pscItems.map((p, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{String(p.name || "Unknown")}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] text-slate-500">{String(p.nationality || "—")}</span>
                          <span className="text-[11px] text-slate-500">{String(p.countryOfResidence || "—")}</span>
                          <span className="text-[11px] text-slate-500">Notified: {String(p.notifiedOn || "—")}</span>
                        </div>
                        {Array.isArray(p.naturesOfControl) && (p.naturesOfControl as string[]).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(p.naturesOfControl as string[]).map((n: string, j) => (
                              <Badge key={j} className="bg-violet-500/10 text-violet-400 border-violet-500/20 border text-[10px]">
                                {n.replace(/-/g, " ")}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      {!!p.ceasedOn && (
                        <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 border text-[10px]">
                          Ceased {String(p.ceasedOn as string)}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filing History */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Recent Filing History</h3>
              </div>
              <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 border text-[10px]">
                {String(filings?.totalFilings || 0)} total filings
              </Badge>
            </div>

            {filingItems.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No filing history available</p>
            ) : (
              <div className="space-y-2">
                {filingItems.map((f, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-white truncate">
                          {String(f.description || f.type || "Filing")}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Calendar className="w-3 h-3 text-slate-600" />
                          <span className="text-[11px] text-slate-500">{String(f.date || "—")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="bg-slate-500/10 text-slate-400 border-slate-500/20 border text-[10px]">
                          {String(f.category || f.type || "—")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Risk Summary */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Risk Summary</h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className={`rounded-lg p-3 border ${Number(charges?.outstandingCharges || 0) > 0 ? "border-red-500/20 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
                <p className="text-[11px] text-slate-500 mb-1">Outstanding Charges</p>
                <p className={`text-lg font-bold ${Number(charges?.outstandingCharges || 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {String(charges?.outstandingCharges || 0)}
                </p>
              </div>
              <div className="rounded-lg p-3 border border-white/[0.05] bg-white/[0.02]">
                <p className="text-[11px] text-slate-500 mb-1">PSC Count</p>
                <p className="text-lg font-bold text-white">{String(psc?.totalPsc || 0)}</p>
              </div>
              <div className="rounded-lg p-3 border border-white/[0.05] bg-white/[0.02]">
                <p className="text-[11px] text-slate-500 mb-1">Total Filings</p>
                <p className="text-lg font-bold text-white">{String(filings?.totalFilings || 0)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-slate-600">
                Source: Companies House REST API — Live data
              </span>
            </div>
          </div>
        </div>
      )}

      {!searchNum && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
          <h3 className="text-sm font-semibold text-white mb-4">What This Tool Reveals</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: AlertTriangle, title: "Charges Register", desc: "See all outstanding and satisfied charges (mortgages, debentures, fixed/floating charges) registered against the company.", color: "text-amber-400 bg-amber-500/10" },
              { icon: Users, title: "Beneficial Ownership", desc: "Identify all persons with significant control — essential for AML checks and understanding who ultimately owns the borrower.", color: "text-violet-400 bg-violet-500/10" },
              { icon: Building2, title: "Filing History", desc: "Review the company's full filing history — late accounts, dormant periods, and restructuring events are all visible here.", color: "text-indigo-400 bg-indigo-500/10" },
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
        </div>
      )}
    </div>
  );
}

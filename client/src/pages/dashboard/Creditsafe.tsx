import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, Loader2, CheckCircle2, Building2, TrendingUp, AlertTriangle } from "lucide-react";

type CsCompany = {
  id: string;
  name: unknown;
  regNo: unknown;
  country: unknown;
  status: unknown;
  creditScore: string | number | null;
  creditLimit: number | null;
  riskClass: string | null;
  amlFlags?: string[];
  source?: string;
};

export default function Creditsafe() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ companies: CsCompany[]; demo: boolean; error: string | null } | null>(null);

  const searchMutation = trpc.creditsafe.searchCompany.useMutation({
    onSuccess: (data) => {
      setResult(data as typeof result);
      const companies = (data as { companies: CsCompany[] }).companies;
      if (companies.length === 0) {
        toast.info("No companies found for that name");
      } else {
        const flagCount = companies.reduce((a, c) => a + (c.amlFlags?.length || 0), 0);
        if (flagCount > 0) {
          toast.warning(`Found ${companies.length} result(s) — ${flagCount} AML flag(s) detected`);
        } else {
          toast.success(`Found ${companies.length} result(s) — no AML flags`);
        }
      }
    },
    onError: () => toast.error("Search failed — please try again"),
  });

  const riskBadge = (riskClass: string | null) => {
    if (!riskClass) return null;
    const lower = riskClass.toLowerCase();
    if (lower.includes("low")) return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border text-xs">{riskClass}</Badge>;
    if (lower.includes("medium")) return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border text-xs">{riskClass}</Badge>;
    return <Badge className="bg-red-500/10 text-red-400 border-red-500/20 border text-xs">{riskClass}</Badge>;
  };

  const scoreColor = (score: string | number | null) => {
    if (score === null || score === undefined) return "text-slate-400";
    const n = typeof score === "number" ? score : parseInt(String(score));
    if (n >= 70) return "text-emerald-400";
    if (n >= 40) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-violet-400" />
          Credit Bureau & AML Screening
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          AML screening, disqualified officer checks, PSC analysis, and risk classification via Companies House — live, free, instant
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Form */}
        <Card className="bg-[#13131f] border-white/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-violet-400" />
              Company AML Search
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
              <p className="text-violet-300 text-xs leading-relaxed">
                Screen any UK company for disqualified directors, PSC ownership anomalies, outstanding charges, and company status flags. Powered by Companies House — live data, no additional API key required.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-xs">Company Name</Label>
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. Acme Construction Ltd"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
                onKeyDown={e => e.key === "Enter" && query.trim() && searchMutation.mutate({ name: query.trim() })}
              />
            </div>
            <Button
              onClick={() => searchMutation.mutate({ name: query.trim() })}
              disabled={searchMutation.isPending || !query.trim()}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-0 gap-2"
            >
              {searchMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Screening company...</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> Run AML Screen</>
              )}
            </Button>

            <div className="space-y-2 pt-2">
              <p className="text-slate-500 text-xs uppercase tracking-wide">What you get</p>
              {[
                { label: "Disqualified Director Check", desc: "Cross-referenced against CH disqualified officers register" },
                { label: "PSC Ownership Analysis", desc: "Persons with Significant Control — 75%+ ownership flags" },
                { label: "Outstanding Charges", desc: "Number of registered charges against the company" },
                { label: "Company Status", desc: "Active, dissolved, in administration, struck off" },
                { label: "Risk Score (0–100)", desc: "Composite AML risk score based on all signals" },
                { label: "Source", desc: "Companies House (live, free, instant — no approval)" },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-slate-300 text-xs font-medium">{item.label}</span>
                    <span className="text-slate-600 text-xs"> — {item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result ? (
          <div className="space-y-3">
            {result.error && (
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-red-400 text-xs">{result.error}</p>
              </div>
            )}
            {result.companies.map((company, i) => (
              <Card key={i} className="bg-[#13131f] border-white/5">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white font-semibold text-sm">{String(company.name)}</p>
                      <p className="text-slate-500 text-xs mt-0.5">Reg No: {String(company.regNo || "—")} · {String(company.country || "GB")}</p>
                    </div>
                    <Badge className={`text-xs border shrink-0 ${String(company.status).toLowerCase().includes("active") ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                      {String(company.status || "Unknown")}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-white/3 text-center">
                      <p className="text-slate-500 text-[11px] uppercase tracking-wide mb-1">Risk Score</p>
                      <p className={`text-2xl font-bold ${scoreColor(company.creditScore)}`}>
                        {company.creditScore ?? "—"}
                      </p>
                      <p className="text-slate-600 text-[10px]">out of 100</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/3 text-center">
                      <p className="text-slate-500 text-[11px] uppercase tracking-wide mb-1">Max Exposure</p>
                      <p className="text-sm font-bold text-white">
                        {company.creditLimit ? `£${Number(company.creditLimit).toLocaleString()}` : "—"}
                      </p>
                      <p className="text-slate-600 text-[10px]">recommended</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/3 text-center">
                      <p className="text-slate-500 text-[11px] uppercase tracking-wide mb-1">Risk Class</p>
                      <div className="flex justify-center mt-1">
                        {riskBadge(company.riskClass) ?? <span className="text-slate-500 text-xs">—</span>}
                      </div>
                    </div>
                  </div>

                  {company.amlFlags && company.amlFlags.length > 0 ? (
                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <p className="text-red-400 text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> AML Flags Detected
                      </p>
                      {company.amlFlags.map((flag, fi) => (
                        <p key={fi} className="text-red-300 text-xs">• {flag}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <p className="text-emerald-400 text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        No AML flags — no disqualified directors, no adverse PSC patterns detected
                      </p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                    <p className="text-indigo-300 text-xs flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Copy this risk score into the AI Analyser notes field to improve decision accuracy
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-[#13131f] border-white/5 flex items-center justify-center min-h-[300px]">
            <div className="text-center p-8">
              <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Search for a company to run AML screening</p>
              <p className="text-slate-600 text-xs mt-1">Checks disqualified directors, PSC flags, and charges</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

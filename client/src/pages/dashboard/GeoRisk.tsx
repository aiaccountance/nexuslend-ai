import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPin, Loader2, AlertTriangle, CheckCircle2, BarChart3, Globe2, Plus, Trash2 } from "lucide-react";

type PostcodeEntry = {
  postcode: string;
  company: string;
  loanAmount: number;
};

type EnrichedEntry = PostcodeEntry & {
  region?: string;
  adminDistrict?: string;
  country?: string;
  lsoa?: string;
  latitude?: number;
  longitude?: number;
  valid: boolean;
  error?: string;
};

export default function GeoRisk() {
  const [entries, setEntries] = useState<PostcodeEntry[]>([
    { postcode: "", company: "", loanAmount: 0 },
  ]);
  const [results, setResults] = useState<EnrichedEntry[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const utils = trpc.useUtils();

  const addRow = () => setEntries(p => [...p, { postcode: "", company: "", loanAmount: 0 }]);
  const removeRow = (i: number) => setEntries(p => p.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof PostcodeEntry, value: string | number) =>
    setEntries(p => p.map((e, idx) => idx === i ? { ...e, [field]: value } : e));

  const runAnalysis = async () => {
    const valid = entries.filter(e => e.postcode.trim() && e.company.trim());
    if (valid.length === 0) { toast.error("Add at least one postcode and company name"); return; }
    setIsRunning(true);
    try {
      const enriched: EnrichedEntry[] = await Promise.all(
        valid.map(async (entry) => {
          try {
            const data = await utils.postcodes.lookup.fetch({ postcode: entry.postcode.trim() });
            if (data && (data as { valid?: boolean }).valid) {
              const d = data as { region?: unknown; adminDistrict?: unknown; country?: unknown; lsoa?: unknown; latitude?: unknown; longitude?: unknown };
              return {
                ...entry,
                region: String(d.region || ""),
                adminDistrict: String(d.adminDistrict || ""),
                country: String(d.country || ""),
                lsoa: String(d.lsoa || ""),
                latitude: d.latitude as number,
                longitude: d.longitude as number,
                valid: true,
              };
            }
            return { ...entry, valid: false, error: "Postcode not found" };
          } catch {
            return { ...entry, valid: false, error: "Lookup failed" };
          }
        })
      );
      setResults(enriched);
      toast.success(`Analysed ${enriched.filter(e => e.valid).length} postcodes`);
    } catch {
      toast.error("Analysis failed");
    } finally {
      setIsRunning(false);
    }
  };

  // Compute concentration by region
  const regionMap: Record<string, { count: number; totalLoan: number }> = {};
  results?.filter(r => r.valid && r.region).forEach(r => {
    const reg = r.region!;
    if (!regionMap[reg]) regionMap[reg] = { count: 0, totalLoan: 0 };
    regionMap[reg].count++;
    regionMap[reg].totalLoan += r.loanAmount;
  });
  const regions = Object.entries(regionMap).sort((a, b) => b[1].totalLoan - a[1].totalLoan);
  const totalLoan = results?.reduce((s, r) => s + r.loanAmount, 0) ?? 0;
  const validCount = results?.filter(r => r.valid).length ?? 0;

  // Concentration risk: if top region > 50% of book
  const topRegionPct = regions.length > 0 && totalLoan > 0 ? (regions[0][1].totalLoan / totalLoan) * 100 : 0;
  const concentrationRisk = topRegionPct > 50 ? "high" : topRegionPct > 30 ? "medium" : "low";

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Globe2 className="w-6 h-6 text-emerald-400" />
          Geographic Risk Analysis
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Map your loan book by postcode — identify regional concentration risk and deprivation exposure
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-[#13131f] border-white/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Borrower Postcodes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-emerald-300 text-xs">Enter each borrower's postcode and loan amount to map your book's geographic concentration risk.</p>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {entries.map((entry, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white/3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-xs">Borrower {i + 1}</span>
                      {entries.length > 1 && (
                        <button onClick={() => removeRow(i)} className="text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Input
                        value={entry.company}
                        onChange={e => updateRow(i, "company", e.target.value)}
                        placeholder="Company name"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 h-8 text-xs"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <Input
                          value={entry.postcode}
                          onChange={e => updateRow(i, "postcode", e.target.value.toUpperCase())}
                          placeholder="EC1A 1BB"
                          className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 h-8 text-xs"
                        />
                        <Input
                          value={entry.loanAmount || ""}
                          onChange={e => updateRow(i, "loanAmount", parseInt(e.target.value) || 0)}
                          placeholder="£ amount"
                          type="number"
                          className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="ghost"
                onClick={addRow}
                className="w-full border border-dashed border-white/10 text-slate-400 hover:text-white hover:border-white/20 gap-2 h-8 text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Borrower
              </Button>

              <Button
                onClick={runAnalysis}
                disabled={isRunning}
                className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 text-white border-0 gap-2"
              >
                {isRunning ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing...</> : <><Globe2 className="w-4 h-4" /> Run Geo Analysis</>}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          {results ? (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-[#13131f] border-white/5">
                  <CardContent className="p-4">
                    <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Postcodes Mapped</p>
                    <p className="text-2xl font-bold text-white">{validCount}</p>
                    <p className="text-slate-600 text-xs">of {results.length} submitted</p>
                  </CardContent>
                </Card>
                <Card className="bg-[#13131f] border-white/5">
                  <CardContent className="p-4">
                    <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total Exposure</p>
                    <p className="text-2xl font-bold text-white">£{totalLoan.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card className={`border ${concentrationRisk === "high" ? "bg-red-500/5 border-red-500/20" : concentrationRisk === "medium" ? "bg-amber-500/5 border-amber-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
                  <CardContent className="p-4">
                    <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">Concentration Risk</p>
                    <p className={`text-2xl font-bold capitalize ${concentrationRisk === "high" ? "text-red-400" : concentrationRisk === "medium" ? "text-amber-400" : "text-emerald-400"}`}>
                      {concentrationRisk}
                    </p>
                    <p className="text-slate-600 text-xs">Top region: {topRegionPct.toFixed(0)}%</p>
                  </CardContent>
                </Card>
              </div>

              {/* Regional Breakdown */}
              {regions.length > 0 && (
                <Card className="bg-[#13131f] border-white/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-400" />
                      Regional Concentration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {regions.map(([region, data]) => {
                      const pct = totalLoan > 0 ? (data.totalLoan / totalLoan) * 100 : 0;
                      const isHigh = pct > 50;
                      const isMed = pct > 30;
                      return (
                        <div key={region} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-300 font-medium">{region}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">{data.count} loan{data.count !== 1 ? "s" : ""}</span>
                              <span className="text-white font-medium">£{data.totalLoan.toLocaleString()}</span>
                              <Badge className={`text-[10px] border ${isHigh ? "bg-red-500/10 text-red-400 border-red-500/20" : isMed ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                                {pct.toFixed(0)}%
                              </Badge>
                            </div>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isHigh ? "bg-red-500" : isMed ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Borrower Detail Table */}
              <Card className="bg-[#13131f] border-white/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm font-semibold">Borrower Postcode Detail</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-white/5">
                    {results.map((r, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${r.valid ? "bg-emerald-500" : "bg-red-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium">{r.company}</p>
                          <p className="text-slate-500 text-[11px]">
                            {r.valid ? `${r.postcode} · ${r.adminDistrict || r.region || "—"} · ${r.region || "—"}` : `${r.postcode} — ${r.error}`}
                          </p>
                          {r.valid && r.lsoa && (
                            <p className="text-slate-600 text-[10px]">LSOA: {r.lsoa}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white text-xs font-medium">£{r.loanAmount.toLocaleString()}</p>
                          {r.valid ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 ml-auto mt-0.5" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Concentration Risk Alert */}
              {concentrationRisk === "high" && (
                <Card className="bg-red-500/5 border-red-500/20">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-300 text-sm font-semibold">High Geographic Concentration Risk</p>
                      <p className="text-slate-400 text-xs mt-1">
                        {topRegionPct.toFixed(0)}% of your loan book is concentrated in {regions[0]?.[0]}. FCA guidelines recommend diversifying geographic exposure to reduce systemic risk. Consider capping new lending in this region until the concentration falls below 40%.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* LSOA Deprivation Note */}
              <Card className="bg-[#13131f] border-white/5">
                <CardContent className="p-4">
                  <p className="text-slate-400 text-xs font-medium mb-2">Understanding LSOA Data</p>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Each postcode is mapped to a Lower Super Output Area (LSOA) — a UK government statistical geography used in the Index of Multiple Deprivation (IMD). LSOAs with high deprivation scores correlate with higher default rates in SME lending. Cross-reference your LSOA codes with the ONS Deprivation dataset to score each borrower's geographic risk tier.
                  </p>
                  <a
                    href="https://www.gov.uk/government/statistics/english-indices-of-deprivation-2019"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 text-xs mt-2 inline-block hover:underline"
                  >
                    → ONS Index of Multiple Deprivation 2019
                  </a>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-[#13131f] border-white/5 flex items-center justify-center min-h-[400px]">
              <div className="text-center p-8">
                <Globe2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 text-sm font-medium">Enter borrower postcodes to map your book</p>
                <p className="text-slate-600 text-xs mt-2 max-w-xs mx-auto">
                  Geographic concentration risk is a key FCA concern. Identify if your book is overexposed to any single region.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

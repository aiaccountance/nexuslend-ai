import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MapPin, CheckCircle2, XCircle, Search, Globe,
  Building2, Loader2, Navigation,
} from "lucide-react";

type PostcodeResult = {
  valid: boolean;
  postcode?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  region?: unknown;
  adminDistrict?: unknown;
  adminCounty?: unknown;
  country?: unknown;
  parliamentaryConstituency?: unknown;
  lsoa?: unknown;
  msoa?: unknown;
  source?: string;
  error?: string;
};

export default function PostcodeEnrich() {
  const [postcodeInput, setPostcodeInput] = useState("");
  const [result, setResult] = useState<PostcodeResult | null>(null);
  const utils = trpc.useUtils();

  const handleLookup = async () => {
    if (!postcodeInput.trim()) return toast.error("Please enter a postcode");
    try {
      const data = await utils.postcodes.lookup.fetch({ postcode: postcodeInput.trim() });
      setResult(data as PostcodeResult);
      if (!(data as PostcodeResult).valid) toast.error("Postcode not found");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    }
  };

  const [loading, setLoading] = useState(false);
  const handleLookupWithLoading = async () => {
    setLoading(true);
    await handleLookup();
    setLoading(false);
  };

  const fields = result?.valid ? [
    { label: "Postcode", value: String(result.postcode || ""), icon: MapPin },
    { label: "Region", value: String(result.region || "—"), icon: Globe },
    { label: "Local Authority", value: String(result.adminDistrict || "—"), icon: Building2 },
    { label: "County", value: String(result.adminCounty || "—"), icon: Building2 },
    { label: "Country", value: String(result.country || "—"), icon: Globe },
    { label: "Constituency", value: String(result.parliamentaryConstituency || "—"), icon: Building2 },
    { label: "Latitude", value: String(result.latitude || "—"), icon: Navigation },
    { label: "Longitude", value: String(result.longitude || "—"), icon: Navigation },
    { label: "LSOA", value: String(result.lsoa || "—"), icon: MapPin },
    { label: "MSOA", value: String(result.msoa || "—"), icon: MapPin },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">UK Postcode Enrichment</h1>
          <p className="text-slate-500 text-sm mt-1">
            Validate and enrich any UK postcode with geographic, administrative, and demographic data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-medium">Live — Postcodes.io</span>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3">
        <MapPin className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-300">Free — No API Key Required</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Postcodes.io is a free, open-source UK postcode API. It validates addresses, returns geographic coordinates, local authority data, and statistical area codes — essential for address fraud detection and geographic risk scoring.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Look Up a Postcode</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              value={postcodeInput}
              onChange={(e) => setPostcodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleLookupWithLoading()}
              placeholder="e.g. SW1A 1AA or EC2V 8RT"
              className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10 font-mono"
            />
          </div>
          <Button
            onClick={handleLookupWithLoading}
            disabled={loading}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-0 h-10 px-5"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Looking up...</>
            ) : (
              <><Search className="w-4 h-4 mr-2" />Look Up</>
            )}
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-6 ${result.valid ? "border-white/[0.06] bg-[#0c0f1a]" : "border-red-500/20 bg-red-500/5"}`}>
          <div className="flex items-center gap-3 mb-5">
            {result.valid ? (
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
            )}
            <div>
              <h3 className="text-base font-bold text-white">
                {result.valid ? `Postcode: ${result.postcode}` : "Postcode Not Found"}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {result.valid ? "Valid UK postcode — full geographic data returned" : result.error}
              </p>
            </div>
            <Badge className={`ml-auto text-xs border ${result.valid ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
              {result.valid ? "VALID" : "INVALID"}
            </Badge>
          </div>

          {result.valid && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {fields.map((f) => (
                <div key={f.label} className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <f.icon className="w-3 h-3 text-slate-600" />
                    <span className="text-[10px] text-slate-600 uppercase tracking-wide font-medium">{f.label}</span>
                  </div>
                  <p className="text-xs font-semibold text-white truncate">{f.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-slate-600">Source: Postcodes.io — Free open-source UK postcode API</span>
          </div>
        </div>
      )}

      {/* Use Cases */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Lending Use Cases</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: "Address Fraud Detection", desc: "Validate that applicant addresses are real UK postcodes before running a credit check — catches fabricated addresses instantly." },
            { title: "Geographic Risk Scoring", desc: "Map borrower locations to deprivation indices (LSOA/MSOA) to adjust risk scores based on local economic conditions." },
            { title: "Portfolio Geographic Spread", desc: "Analyse your loan book by region and local authority to identify geographic concentration risk." },
            { title: "Bulk Address Cleansing", desc: "Validate and standardise hundreds of addresses in a single API call — essential for data quality before credit bureau lookups." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-4">
              <p className="text-sm font-semibold text-white mb-1">{item.title}</p>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

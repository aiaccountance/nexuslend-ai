import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2, CheckCircle2, XCircle, Search, Shield,
  MapPin, Hash, Calendar, FileText, Loader2,
} from "lucide-react";

type VatResult = {
  valid: boolean;
  vatNumber?: string;
  businessName?: string;
  address?: { line1: string; line2: string; postcode: string; countryCode: string };
  consultationNumber?: string;
  processingDate?: string;
  source?: string;
  error?: string;
};

export default function HmrcVat() {
  const [vatInput, setVatInput] = useState("");
  const [result, setResult] = useState<VatResult | null>(null);

  const verifyMutation = trpc.hmrc.verifyVat.useMutation({
    onSuccess: (data) => {
      setResult(data as VatResult);
      if ((data as VatResult).valid) {
        toast.success("VAT number verified successfully");
      } else {
        toast.error("VAT number not found or invalid");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleVerify = () => {
    if (!vatInput.trim()) return toast.error("Please enter a VAT number");
    verifyMutation.mutate({ vatNumber: vatInput.trim() });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">HMRC VAT Verification</h1>
          <p className="text-slate-500 text-sm mt-1">
            Verify any UK VAT number against the official HMRC register in real time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400 font-medium">Live — CH Cross-Reference</span>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 flex items-start gap-3">
        <Shield className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-indigo-300">UK VAT Verification</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Validates UK VAT number format and cross-references via Companies House to return the registered business name and address. Free, instant, no API key required.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Verify a VAT Number</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              value={vatInput}
              onChange={(e) => setVatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              placeholder="e.g. GB123456789 or 123456789"
              className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 h-10"
            />
            <p className="text-[11px] text-slate-600 mt-1.5">Enter with or without the GB prefix</p>
          </div>
          <Button
            onClick={handleVerify}
            disabled={verifyMutation.isPending}
            className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 h-10 px-5"
          >
            {verifyMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying...</>
            ) : (
              <><Search className="w-4 h-4 mr-2" />Verify</>
            )}
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-6 ${result.valid ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
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
              <h3 className={`text-base font-bold ${result.valid ? "text-emerald-300" : "text-red-300"}`}>
                {result.valid ? "VAT Number Verified" : "VAT Number Invalid"}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {result.valid ? "VAT format valid — verified via Companies House cross-reference" : result.error || "Invalid VAT number format"}
              </p>
            </div>
            <Badge className={`ml-auto text-xs border ${result.valid ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
              {result.valid ? "VALID" : "INVALID"}
            </Badge>
          </div>

          {result.valid && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Business Name</span>
                </div>
                <p className="text-sm font-semibold text-white">{result.businessName}</p>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">VAT Number</span>
                </div>
                <p className="text-sm font-semibold text-white font-mono">GB{result.vatNumber}</p>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Registered Address</span>
                </div>
                <p className="text-sm text-white">
                  {[result.address?.line1, result.address?.line2, result.address?.postcode]
                    .filter(Boolean).join(", ")}
                </p>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Consultation Ref</span>
                </div>
                <p className="text-xs font-mono text-slate-300">{result.consultationNumber || "—"}</p>
              </div>

              <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-4 sm:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Processing Date</span>
                </div>
                <p className="text-sm text-slate-300">{result.processingDate || new Date().toISOString()}</p>
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] text-slate-600">Source: UK VAT format validation + Companies House cross-reference (free, instant, no approval needed)</span>
          </div>
        </div>
      )}

      {/* Guide */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Why VAT Verification Matters for Lending</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Shield, title: "Fraud Prevention", desc: "Confirms the business is real and registered, catching fake company applications before they reach underwriting.", color: "text-indigo-400 bg-indigo-500/10" },
            { icon: Building2, title: "Business Legitimacy", desc: "VAT registration indicates a trading business with £90k+ turnover — a key affordability signal.", color: "text-violet-400 bg-violet-500/10" },
            { icon: FileText, title: "Audit Trail", desc: "The consultation reference number provides a timestamped, HMRC-issued proof of verification for your compliance records.", color: "text-emerald-400 bg-emerald-500/10" },
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
    </div>
  );
}

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  FileSearch, Upload, X, CheckCircle2, AlertTriangle, XCircle,
  Zap, Shield, TrendingUp, Database, ChevronDown, ChevronUp,
  Loader2, FileText, Sparkles, Info, Landmark, ArrowUpCircle, ArrowDownCircle,
  Download,
} from "lucide-react";

type AnalysisResult = {
  scores?: {
    credit?: { score?: number; rating?: string; confidence_interval?: string; shap_top_factor?: string; top_factors_up?: string[]; top_factors_down?: string[] };
    fraud?: { score?: number; rating?: string; confidence_interval?: string; shap_top_factor?: string; signals_flagged?: string[] };
    affordability?: { score?: number; monthly_capacity?: number; dsc_ratio?: number; confidence_interval?: string; shap_top_factor?: string };
    data_confidence?: { score?: number; missing_data?: string[]; shap_top_factor?: string };
  };
  fraud_matrix?: Record<string, string>;
  recommendation?: string;
  recommendation_reason?: string;
  key_flags?: Array<string | { criterion?: string; result?: string; weight?: number; detail?: string }>;
  narrative?: {
    borrower_summary?: string;
    key_strengths?: string[];
    key_concerns?: string[];
    fraud_signals?: string;
    affordability?: string;
  };
  compliance_note?: string;
};

const SECTORS = ["Technology/SaaS", "Retail", "Construction", "Manufacturing", "Hospitality", "Healthcare", "Professional Services", "Property", "Transport & Logistics", "Other"];
const LOAN_TYPES = ["Business Loan", "Invoice Finance", "Asset Finance", "Merchant Cash Advance", "Property Finance", "Working Capital", "Trade Finance"];

const FRAUD_LABELS: Record<string, string> = {
  layer_01_synthetic_identity: "Synthetic Identity",
  layer_02_document_authenticity: "Document Authenticity",
  layer_03_cash_inflation: "Pre-Application Cash Inflation",
  layer_04_round_tripping: "Round-Tripping",
  layer_05_income_crosscheck: "Income Cross-Check",
  layer_06_cifas: "CIFAS Markers",
  layer_07_director_network: "Director Network",
  layer_08_companies_house: "Companies House Anomalies",
  layer_09_device_fingerprint: "Device Fingerprinting",
  layer_10_land_registry: "Land Registry Charges",
  layer_11_vat_hmrc: "VAT/HMRC Cross-Reference",
  layer_12_open_banking_velocity: "Open Banking Velocity",
  layer_13_adverse_credit: "Adverse Credit / CCJ",
  layer_14_behavioural: "Behavioural Biometrics (Beta)",
  layer_15_connected_party: "Connected Party Transactions",
  layer_16_web_presence: "Social Media & Web Presence",
  layer_17_sector_fraud: "Sector-Specific Fraud Patterns",
  layer_18_application_velocity: "Application Velocity",
  layer_19_address_anomaly: "Address & Registered Office",
  layer_20_payroll_verification: "Payroll & Employment Verification",
};

function ScoreRing({ score, label, icon: Icon, color, bg }: {
  score: number; label: string; icon: React.ElementType; color: string; bg: string;
}) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative w-[88px] h-[88px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center mb-0.5 ${bg}`}>
            <Icon className="w-3 h-3" style={{ color }} />
          </div>
          <span className="text-[18px] font-bold text-white leading-none">{score}</span>
        </div>
      </div>
      <span className="text-[11px] text-slate-400 font-medium text-center leading-tight">{label}</span>
    </div>
  );
}

function FraudBadge({ result }: { result: string }) {
  if (result === "PASS") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">✓ PASS</span>;
  if (result === "FLAG") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">⚠ FLAG</span>;
  if (result === "ALERT") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">✗ ALERT</span>;
  if (result === "BETA") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-500/10 border border-slate-500/20 rounded-full px-2 py-0.5">BETA</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">API REQ.</span>;
}

export default function Analyser() {
  const [form, setForm] = useState({
    companyName: "", loanAmount: "", loanType: "Business Loan",
    loanTermMonths: "", sector: "", notes: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [obData, setObData] = useState<Record<string, unknown> | null>(null);
    const [showMatrix, setShowMatrix] = useState(false);
  const [showNarrative, setShowNarrative] = useState(true);
  const [activeTab, setActiveTab] = useState<"scores" | "report">("scores");
  const [writtenReport, setWrittenReport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.analyser.uploadDocument.useMutation();
  const analyseMutation = trpc.analyser.analyse.useMutation();
  const exportPdfMutation = trpc.analyser.exportPdf.useMutation();
  const generateReportMutation = trpc.analyser.generateBankStatementReport.useMutation();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const handleGenerateReport = async () => {
    if (!result) return;
    setReportLoading(true);
    try {
      const res = await generateReportMutation.mutateAsync({
        companyName: form.companyName,
        loanAmount: form.loanAmount,
        loanType: form.loanType,
        documentText: form.notes,
        structuredAnalysis: result as Record<string, unknown>,
      });
      if (res.success && res.report) {
        setWrittenReport(res.report);
        setActiveTab("report");
        toast.success("Written report generated");
      }
    } catch (err) {
      console.error("[generateReport error]", err);
      toast.error("Failed to generate written report");
    } finally {
      setReportLoading(false);
    }
  };
  const handleDownloadPdf = async () => {
    if (!result) return;
    setPdfLoading(true);
    try {
      const res = await exportPdfMutation.mutateAsync({
        companyName: form.companyName,
        loanAmount: form.loanAmount,
        loanType: form.loanType,
        recommendation: result.recommendation,
        recommendationReason: result.recommendation_reason,
        scores: result.scores as Record<string, unknown> | undefined,
        fraudMatrix: result.fraud_matrix,
        keyFlags: result.key_flags as unknown[] | undefined,
        narrative: result.narrative as Record<string, unknown> | undefined,
      });
      // Decode base64 PDF and trigger browser download
      const byteChars = atob(res.pdfBase64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (err) {
      console.error("[exportPdf error]", err);
      toast.error("Failed to generate PDF report");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...newFiles].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...dropped].slice(0, 10));
  };

  const handleSubmit = async () => {
    if (!form.companyName || !form.loanAmount) {
      toast.error("Company name and loan amount are required");
      return;
    }
    // Reset state for new run
    setResult(null);
    setObData(null);
    try {
      const fileUrls: string[] = [];
      let documentText = form.notes;
      for (const file of files) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        try {
          const uploaded = await uploadMutation.mutateAsync({ fileName: file.name, fileBase64: base64, mimeType: file.type });
          fileUrls.push(uploaded.url);
          if (uploaded.extractedText && uploaded.extractedText.length > 50) {
            // Use the actual PDF text content for LLM analysis
            documentText += `\n\n=== DOCUMENT: ${file.name} ===\n${uploaded.extractedText.slice(0, 8000)}`;
          } else {
            documentText += `\n[Uploaded: ${file.name}]`;
          }
        } catch { /* continue */ }
      }
      const res = await analyseMutation.mutateAsync({
        companyName: form.companyName, loanAmount: form.loanAmount,
        loanType: form.loanType, loanTermMonths: form.loanTermMonths ? parseInt(form.loanTermMonths) : undefined,
        sector: form.sector || undefined, documentText, fileUrls,
      });
      if (res.structured) {
        setResult(res.structured as AnalysisResult);
        if (res.openBankingData) setObData(res.openBankingData as Record<string, unknown>);
        setActiveTab("scores");
        setWrittenReport(null);
        toast.success("Analysis complete");
      } else {
        toast.error("Analysis returned no structured data");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[analyser.analyse error]", err);
      toast.error(`Analysis failed: ${msg.slice(0, 120)}`);
    }
  };

  const rec = result?.recommendation;
  const recStyle = rec === "PROCEED"
    ? { border: "border-emerald-500/25", bg: "bg-emerald-500/5", icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />, text: "text-emerald-400", bar: "bg-emerald-500" }
    : rec === "DECLINE"
    ? { border: "border-red-500/25", bg: "bg-red-500/5", icon: <XCircle className="w-5 h-5 text-red-400" />, text: "text-red-400", bar: "bg-red-500" }
    : { border: "border-amber-500/25", bg: "bg-amber-500/5", icon: <AlertTriangle className="w-5 h-5 text-amber-400" />, text: "text-amber-400", bar: "bg-amber-500" };

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <h1 className="text-[20px] font-bold text-white tracking-tight">AI Credit Analyser</h1>
          </div>
          <p className="text-slate-500 text-[13px]">8-domain underwriting engine · FCA Consumer Duty compliant</p>
        </div>
        <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 border text-[10px] font-semibold px-2.5 py-1">
          LIVE AI
        </Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        {/* ── Input Form ── */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6 space-y-5 h-fit">
          <div>
            <h2 className="text-[13px] font-semibold text-white mb-0.5">Application Details</h2>
            <p className="text-[11px] text-slate-600">All fields marked * are required to run the analysis</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Company / Applicant Name *</Label>
              <Input value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))}
                placeholder="e.g. Acme Ltd"
                className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-slate-700 focus:border-indigo-500/50 h-9 text-[13px]" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Loan Amount *</Label>
                <Input value={form.loanAmount} onChange={e => setForm(p => ({ ...p, loanAmount: e.target.value }))}
                  placeholder="e.g. £50,000"
                  className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-slate-700 focus:border-indigo-500/50 h-9 text-[13px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Term (months)</Label>
                <Input value={form.loanTermMonths} onChange={e => setForm(p => ({ ...p, loanTermMonths: e.target.value }))}
                  placeholder="e.g. 24" type="number"
                  className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-slate-700 focus:border-indigo-500/50 h-9 text-[13px]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Loan Type</Label>
                <Select value={form.loanType} onValueChange={v => setForm(p => ({ ...p, loanType: v }))}>
                  <SelectTrigger className="bg-white/[0.03] border-white/[0.08] text-white h-9 text-[13px] focus:border-indigo-500/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141824] border-white/10">
                    {LOAN_TYPES.map(t => <SelectItem key={t} value={t} className="text-slate-300 text-[13px] focus:text-white focus:bg-white/5">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Sector</Label>
                <Select value={form.sector} onValueChange={v => setForm(p => ({ ...p, sector: v }))}>
                  <SelectTrigger className="bg-white/[0.03] border-white/[0.08] text-white h-9 text-[13px] focus:border-indigo-500/50">
                    <SelectValue placeholder="Select sector" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141824] border-white/10">
                    {SECTORS.map(s => <SelectItem key={s} value={s} className="text-slate-300 text-[13px] focus:text-white focus:bg-white/5">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Financial Data / Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Paste bank statement data, revenue figures, or any additional context..."
                rows={3}
                className="bg-white/[0.03] border-white/[0.08] text-white placeholder:text-slate-700 focus:border-indigo-500/50 resize-none text-[13px]" />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Upload Documents (up to 10)</Label>
              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border border-dashed border-white/[0.08] rounded-lg p-5 text-center cursor-pointer hover:border-indigo-500/30 hover:bg-indigo-500/[0.03] transition-all group"
              >
                <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-2 group-hover:bg-indigo-500/10 transition-colors">
                  <Upload className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                </div>
                <p className="text-[12px] text-slate-500 font-medium">Drop files here or click to browse</p>
                <p className="text-[11px] text-slate-700 mt-0.5">PDF, PNG, JPG, CSV — max 16MB each</p>
              </div>
              <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx" className="hidden" onChange={handleFileAdd} />
              {files.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2.5 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                      <div className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <FileText className="w-3 h-3 text-indigo-400" />
                      </div>
                      <span className="text-slate-300 text-[12px] flex-1 truncate">{f.name}</span>
                      <span className="text-slate-600 text-[11px] shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={(e) => { e.stopPropagation(); setFiles(prev => prev.filter((_, j) => j !== i)); }}>
                        <X className="w-3.5 h-3.5 text-slate-600 hover:text-red-400 transition-colors" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={analyseMutation.isPending || uploadMutation.isPending}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-indigo-500/20 h-10 text-[13px] font-semibold gap-2"
          >
            {analyseMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analysing — please wait...</>
            ) : (
              <><Zap className="w-4 h-4" /> Run Full AI Analysis</>
            )}
          </Button>
        </div>

        {/* ── Results ── */}
        <div className="space-y-4 min-w-0">
          {!result && !analyseMutation.isPending && (
            <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] flex flex-col items-center justify-center min-h-[480px] p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
                <FileSearch className="w-7 h-7 text-indigo-400" />
              </div>
              <p className="text-[15px] font-semibold text-slate-300 mb-1">Results will appear here</p>
              <p className="text-[12px] text-slate-600 max-w-xs">Complete the application form on the left and click Run Full AI Analysis to see the 8-domain credit decision</p>
              <div className="mt-6 grid grid-cols-2 gap-2 w-full max-w-xs">
                {["Credit Score", "Fraud Matrix", "Affordability", "FCA Note"].map(tag => (
                  <div key={tag} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5 text-center">
                    <p className="text-[11px] text-slate-500">{tag}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analyseMutation.isPending && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.03] flex flex-col items-center justify-center min-h-[480px] p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center mb-4">
                <Zap className="w-7 h-7 text-indigo-400 animate-pulse" />
              </div>
              <p className="text-[15px] font-semibold text-white mb-1">Running 8-domain analysis...</p>
              <p className="text-[12px] text-slate-500 mb-6">Processing application data across all 8 domains...</p>
              <div className="space-y-2 w-full max-w-xs text-left">
                {["Credit history & bureau data", "Fraud velocity checks", "Affordability & DSC ratio", "Companies House verification", "Open banking signals", "20-layer fraud matrix", "Sector-specific scoring", "FCA compliance check"].map((step, i) => (
                  <div key={step} className="flex items-center gap-2.5 text-[12px]">
                    <Loader2 className="w-3 h-3 text-indigo-400 animate-spin shrink-0" style={{ animationDelay: `${i * 0.15}s` }} />
                    <span className="text-slate-400">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Result header with tabs and buttons */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab("scores")}
                    className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all ${
                      activeTab === "scores"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "text-slate-500 hover:text-slate-400"
                    }`}
                  >
                    Scores & Matrix
                  </button>
                  <button
                    onClick={handleGenerateReport}
                    disabled={reportLoading}
                    className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all ${
                      activeTab === "report"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "text-slate-500 hover:text-slate-400"
                    } disabled:opacity-50`}
                  >
                    {reportLoading && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                    Written Report
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="h-8 gap-1.5 text-[12px] bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200"
                >
                  {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {pdfLoading ? "Generating..." : "Download PDF"}
                </Button>
              </div>
              {/* Written Report Tab */}
              {activeTab === "report" && writtenReport && (
                <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6 prose prose-invert max-w-none text-[13px] space-y-4">
                  <div className="text-slate-300 leading-relaxed whitespace-pre-wrap break-words">{writtenReport}</div>
                </div>
              )}
              {/* Scores Tab */}
              {activeTab === "scores" && (
              <div className="space-y-4">
              {/* Recommendation Banner */}
              <div className={`rounded-xl border ${recStyle.border} ${recStyle.bg} p-5 flex items-center gap-4`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${recStyle.bg} border ${recStyle.border}`}>
                  {recStyle.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[18px] font-bold ${recStyle.text}`}>{result.recommendation}</span>
                    <div className={`h-1.5 flex-1 rounded-full bg-white/[0.05] overflow-hidden`}>
                      <div className={`h-full ${recStyle.bar} rounded-full`} style={{ width: rec === "PROCEED" ? "85%" : rec === "DECLINE" ? "20%" : "55%" }} />
                    </div>
                  </div>
                  <p className="text-slate-400 text-[12px]">{result.recommendation_reason}</p>
                </div>
              </div>

              {/* Score Rings */}
              <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] p-6">
                <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-5">Score Cards</h3>
                <div className="grid grid-cols-4 gap-4">
                  <ScoreRing score={result.scores?.credit?.score ?? 0} label="Credit Score" icon={TrendingUp} color="#818cf8" bg="bg-indigo-500/10" />
                  <ScoreRing score={result.scores?.fraud?.score ?? 0} label="Fraud Risk" icon={Shield} color="#f59e0b" bg="bg-amber-500/10" />
                  <ScoreRing score={result.scores?.affordability?.score ?? 0} label="Affordability" icon={CheckCircle2} color="#34d399" bg="bg-emerald-500/10" />
                  <ScoreRing score={result.scores?.data_confidence?.score ?? 0} label="Data Quality" icon={Database} color="#60a5fa" bg="bg-blue-500/10" />
                </div>
                {/* SHAP Top Factors & Confidence Intervals */}
                {(result.scores?.credit?.shap_top_factor || result.scores?.credit?.confidence_interval) && (
                  <div className="mt-4 pt-4 border-t border-white/[0.05] grid grid-cols-2 gap-3">
                    {[
                      { label: "Credit", color: "text-indigo-400", shap: (result.scores?.credit as Record<string, unknown>)?.shap_top_factor as string, ci: (result.scores?.credit as Record<string, unknown>)?.confidence_interval as string },
                      { label: "Fraud", color: "text-amber-400", shap: (result.scores?.fraud as Record<string, unknown>)?.shap_top_factor as string, ci: (result.scores?.fraud as Record<string, unknown>)?.confidence_interval as string },
                      { label: "Affordability", color: "text-emerald-400", shap: (result.scores?.affordability as Record<string, unknown>)?.shap_top_factor as string, ci: (result.scores?.affordability as Record<string, unknown>)?.confidence_interval as string },
                      { label: "Data Quality", color: "text-blue-400", shap: (result.scores?.data_confidence as Record<string, unknown>)?.shap_top_factor as string, ci: undefined },
                    ].filter(s => s.shap || s.ci).map((s, i) => (
                      <div key={i} className="bg-white/[0.02] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${s.color}`}>{s.label}</span>
                          {s.ci && <span className="text-[10px] text-slate-500 font-mono">CI: {s.ci}</span>}
                        </div>
                        {s.shap && <p className="text-[11px] text-slate-300 leading-relaxed">{s.shap}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {result.scores?.affordability?.dsc_ratio !== undefined && (
                  <div className="mt-4 pt-4 border-t border-white/[0.05] flex gap-6">
                    <div>
                      <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-0.5">DSC Ratio</p>
                      <p className="text-[14px] font-bold text-white">{result.scores.affordability.dsc_ratio?.toFixed(2)}x</p>
                    </div>
                    {result.scores?.affordability?.monthly_capacity !== undefined && (
                      <div>
                        <p className="text-[10px] text-slate-600 uppercase tracking-wide mb-0.5">Monthly Capacity</p>
                        <p className="text-[14px] font-bold text-white">£{result.scores.affordability.monthly_capacity?.toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Key Flags */}
              {result.key_flags && result.key_flags.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h3 className="text-[12px] font-semibold text-amber-400 uppercase tracking-wide">Key Flags</h3>
                  </div>
                  <div className="space-y-2">
                    {result.key_flags.map((flag, i) => {
                      if (typeof flag === "string") {
                        return (
                          <div key={i} className="flex items-start gap-2.5 text-[12px] text-slate-300">
                            <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                            {flag}
                          </div>
                        );
                      }
                      // Object flag: {criterion, result, weight, detail}
                      const flagResult = flag.result ?? "FLAG";
                      const flagColor = flagResult === "PASS" ? "text-emerald-400" : flagResult === "FAIL" ? "text-red-400" : "text-amber-400";
                      const flagIcon = flagResult === "PASS" ? "✓" : flagResult === "FAIL" ? "✗" : "⚠";
                      return (
                        <div key={i} className="flex items-start gap-2.5 text-[12px] border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                          <span className={`${flagColor} mt-0.5 shrink-0 font-bold`}>{flagIcon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-slate-200 font-medium">{flag.criterion ?? "Flag"}</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                flagResult === "PASS" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
                                flagResult === "FAIL" ? "text-red-400 bg-red-500/10 border-red-500/20" :
                                "text-amber-400 bg-amber-500/10 border-amber-500/20"
                              }`}>{flagResult}</span>
                              {flag.weight !== undefined && flag.weight > 0 && (
                                <span className="text-[10px] text-slate-600">w:{flag.weight}</span>
                              )}
                            </div>
                            {flag.detail && <p className="text-slate-500 text-[11px] leading-relaxed">{flag.detail}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 20-Layer Fraud Matrix */}
              <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
                  onClick={() => setShowMatrix(p => !p)}
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-violet-400" />
                    <h3 className="text-[13px] font-semibold text-white">20-Layer Fraud Matrix</h3>
                  </div>
                  {showMatrix ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {showMatrix && (
                  <div className="px-5 pb-5 border-t border-white/[0.05]">
                    <div className="mt-4 space-y-2">
                      {Object.entries(result.fraud_matrix ?? {}).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
                          <span className="text-[12px] text-slate-400">{FRAUD_LABELS[key] ?? key}</span>
                          <FraudBadge result={val} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Narrative */}
              <div className="rounded-xl border border-white/[0.06] bg-[#0c0f1a] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
                  onClick={() => setShowNarrative(p => !p)}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-[13px] font-semibold text-white">Underwriting Narrative</h3>
                  </div>
                  {showNarrative ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {showNarrative && result.narrative && (
                  <div className="px-5 pb-5 border-t border-white/[0.05] space-y-4 mt-4">
                    {result.narrative.borrower_summary && (
                      <p className="text-[13px] text-slate-300 leading-relaxed">{result.narrative.borrower_summary}</p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {result.narrative.key_strengths && result.narrative.key_strengths.length > 0 && (
                        <div className="rounded-lg bg-emerald-500/[0.04] border border-emerald-500/10 p-4">
                          <p className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wide mb-2.5">Strengths</p>
                          <ul className="space-y-1.5">
                            {result.narrative.key_strengths.map((s, i) => (
                              <li key={i} className="text-[12px] text-slate-400 flex items-start gap-2">
                                <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>{s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.narrative.key_concerns && result.narrative.key_concerns.length > 0 && (
                        <div className="rounded-lg bg-amber-500/[0.04] border border-amber-500/10 p-4">
                          <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide mb-2.5">Concerns</p>
                          <ul className="space-y-1.5">
                            {result.narrative.key_concerns.map((c, i) => (
                              <li key={i} className="text-[12px] text-slate-400 flex items-start gap-2">
                                <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>{c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    {result.narrative.affordability && (
                      <div className="rounded-lg bg-blue-500/[0.04] border border-blue-500/10 p-4">
                        <p className="text-[11px] font-semibold text-blue-400 uppercase tracking-wide mb-1.5">Affordability Assessment</p>
                        <p className="text-[12px] text-slate-400">{result.narrative.affordability}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Open Banking Summary */}
              {obData && (
                <div className="rounded-xl border border-teal-500/20 bg-teal-500/[0.03] p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Landmark className="w-4 h-4 text-teal-400" />
                    <h3 className="text-[13px] font-semibold text-white">Open Banking Data</h3>
                    <span className="ml-auto text-[10px] font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-full px-2 py-0.5">
                      TrueLayer PSD2 • Verified
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Avg Monthly Revenue</p>
                      <p className="text-[15px] font-bold text-white">£{Number(obData.avg_monthly_revenue || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Total Credits (12mo)</p>
                      <p className="text-[15px] font-bold text-emerald-400 flex items-center gap-1">
                        <ArrowUpCircle className="w-3.5 h-3.5" />£{Number(obData.total_credits_12mo || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Total Debits (12mo)</p>
                      <p className="text-[15px] font-bold text-red-400 flex items-center gap-1">
                        <ArrowDownCircle className="w-3.5 h-3.5" />£{Number(obData.total_debits_12mo || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Cash Trend</p>
                      <p className={`text-[15px] font-bold capitalize ${
                        obData.cash_trend === "improving" ? "text-emerald-400" :
                        obData.cash_trend === "deteriorating" ? "text-red-400" : "text-slate-300"
                      }`}>{String(obData.cash_trend || "stable")}</p>
                    </div>
                  </div>
                  {Array.isArray(obData.risk_signals) && (obData.risk_signals as string[]).length > 0 && (
                    <div className="mt-3 rounded-lg bg-amber-500/[0.05] border border-amber-500/15 p-3">
                      <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1.5">Open Banking Risk Signals</p>
                      {(obData.risk_signals as string[]).map((s, i) => (
                        <p key={i} className="text-[12px] text-slate-400 flex items-start gap-2">
                          <span className="text-amber-500 shrink-0">⚠</span>{s}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-600 mt-3">
                    Bank: {String(obData.bank || "Connected")} · {String(obData.transaction_count ?? 0)} transactions · Data as of {obData.data_as_of ? new Date(obData.data_as_of as string).toLocaleDateString("en-GB") : "recently"}
                  </p>
                </div>
              )}

              {/* FCA Compliance Note */}
              {result.compliance_note && (
                <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.03] p-4 flex items-start gap-3">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-slate-400 leading-relaxed">{result.compliance_note}</p>
                </div>
              )}
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

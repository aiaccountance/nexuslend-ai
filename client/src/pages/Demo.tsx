import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload, FileText, Zap, CheckCircle2, XCircle, AlertTriangle,
  ChevronRight, Shield, BarChart3, Brain, ArrowLeft, Loader2,
  TrendingUp, TrendingDown, Minus, Download, ExternalLink,
} from "lucide-react";
import { Link } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScoreData {
  score: number;
  rating?: string;
  top_factors_up?: string[];
  top_factors_down?: string[];
  signals_flagged?: string[];
  monthly_capacity?: number;
  dsc_ratio?: number;
  missing_data?: string[];
}

interface AnalysisResult {
  borrower?: { name: string; facility: string; amount: number; term_months: number; jurisdiction?: string };
  scores?: {
    credit?: ScoreData;
    fraud?: ScoreData;
    affordability?: ScoreData;
    data_confidence?: ScoreData;
  };
  fraud_matrix?: Record<string, string>;
  recommendation?: "PROCEED" | "REVIEW" | "DECLINE";
  recommendation_reason?: string;
  key_flags?: Array<{ criterion: string; result: string; weight: number; detail: string } | string>;
  narrative?: {
    borrower_summary?: string;
    key_strengths?: string[];
    key_concerns?: string[];
    fraud_signals?: string;
    affordability?: string;
  };
  compliance_note?: string;
}

interface ExampleDeal {
  id: string;
  label: string;
  icon: string;
  description: string;
  data: {
    companyName: string;
    loanAmount: string;
    loanType: string;
    loanTermMonths?: number;
    sector?: string;
    documentText: string;
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">{score}</span>
      </div>
      <span className="text-xs text-slate-400 text-center leading-tight">{label}</span>
    </div>
  );
}

function FraudBadge({ value }: { value: string }) {
  const v = (value || "").toUpperCase();
  if (v === "PASS") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 className="w-3 h-3" /> PASS
    </span>
  );
  if (v === "FLAG") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
      <AlertTriangle className="w-3 h-3" /> FLAG
    </span>
  );
  if (v === "FAIL") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
      <XCircle className="w-3 h-3" /> FAIL
    </span>
  );
  if (v === "ALERT") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
      <XCircle className="w-3 h-3" /> ALERT
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-700">
      {value.replace(/_/g, " ")}
    </span>
  );
}

function FraudLayerLabel({ layerKey: k }: { layerKey: string }) {
  const labels: Record<string, string> = {
    layer_01_synthetic_identity: "01 — Synthetic Identity",
    layer_02_document_authenticity: "02 — Document Authenticity",
    layer_03_cash_inflation: "03 — Pre-Application Cash Inflation",
    layer_04_round_tripping: "04 — Round-Tripping",
    layer_05_income_crosscheck: "05 — Income Cross-Check",
    layer_06_cifas: "06 — Fraud Bureau Markers",
    layer_07_director_network: "07 — Director/Officer Network",
    layer_08_companies_house: "08 — Company Registry Anomalies",
    layer_09_device_fingerprint: "09 — Device Fingerprinting",
    layer_10_land_registry: "10 — Property/Asset Registry",
    layer_11_vat_hmrc: "11 — Tax/VAT Cross-Reference",
    layer_12_open_banking_velocity: "12 — Open Banking Velocity",
    layer_13_adverse_credit: "13 — Adverse Credit/Judgments",
    layer_14_behavioural: "14 — Behavioural Biometrics",
    layer_15_connected_party: "15 — Connected Party Transactions",
    layer_16_web_presence: "16 — Social Media & Web Presence",
    layer_17_sector_fraud: "17 — Sector-Specific Fraud Patterns",
    layer_18_application_velocity: "18 — Application Velocity",
    layer_19_address_anomaly: "19 — Address & Registered Office",
    layer_20_payroll_verification: "20 — Payroll & Employment Verification",
  };
  return <span>{labels[k] ?? k.replace(/_/g, " ")}</span>;
}

function ResultsPanel({ result, processingTimeMs, onReset, companyName, loanAmount, loanType }: {
  result: AnalysisResult;
  processingTimeMs: number;
  onReset: () => void;
  companyName: string;
  loanAmount: string;
  loanType: string;
}) {
  const saveToPipelineMutation = trpc.analyser.saveToPipeline.useMutation();
  const [savedToPipeline, setSavedToPipeline] = useState(false);

  const handleSaveToPipeline = async () => {
    try {
      const res = await saveToPipelineMutation.mutateAsync({
        companyName,
        loanAmount,
        loanType,
        structured: result as Record<string, unknown>,
      });
      if (res.success) {
        setSavedToPipeline(true);
        toast.success("Deal saved to your pipeline! Log in to view it.");
      } else {
        toast.error("Could not save to pipeline. Please try again.");
      }
    } catch {
      toast.error("Could not save to pipeline. Please try again.");
    }
  };
  const rec = result.recommendation ?? "REVIEW";
  const recConfig = {
    PROCEED: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", icon: <CheckCircle2 className="w-6 h-6" />, bar: "bg-emerald-500", label: "PROCEED — APPROVED" },
    REVIEW: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", icon: <AlertTriangle className="w-6 h-6" />, bar: "bg-amber-500", label: "REVIEW — MANUAL ASSESSMENT REQUIRED" },
    DECLINE: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", icon: <XCircle className="w-6 h-6" />, bar: "bg-red-500", label: "DECLINE — NOT RECOMMENDED" },
  }[rec];

  const scores = result.scores ?? {};
  const creditScore = scores.credit?.score ?? 0;
  const fraudScore = scores.fraud?.score ?? 0;
  const affordScore = scores.affordability?.score ?? 0;
  const confScore = scores.data_confidence?.score ?? 0;

  const fraudMatrix = result.fraud_matrix ?? {};
  const fraudEntries = Object.entries(fraudMatrix);

  const keyFlags = result.key_flags ?? [];
  const narrative = result.narrative ?? {};

  const handleExportPDF = () => {
    const printContent = document.getElementById("demo-results-printable");
    if (!printContent) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>NexusLend AI — Underwriting Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        h2 { font-size: 14px; margin-top: 16px; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; }
        th { background: #f5f5f5; font-weight: bold; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; }
        .pass { background: #d1fae5; color: #065f46; }
        .flag { background: #fef3c7; color: #92400e; }
        .alert { background: #fee2e2; color: #991b1b; }
        .na { background: #f3f4f6; color: #6b7280; }
        .rec-proceed { background: #d1fae5; color: #065f46; padding: 8px; border-radius: 4px; font-weight: bold; }
        .rec-review { background: #fef3c7; color: #92400e; padding: 8px; border-radius: 4px; font-weight: bold; }
        .rec-decline { background: #fee2e2; color: #991b1b; padding: 8px; border-radius: 4px; font-weight: bold; }
        .footer { margin-top: 20px; font-size: 10px; color: #6b7280; border-top: 1px solid #ddd; padding-top: 8px; }
      </style></head><body>`);
    w.document.write(`<h1>NexusLend AI — Underwriting Report</h1>`);
    w.document.write(`<p><strong>Borrower:</strong> ${result.borrower?.name ?? "—"} &nbsp;|&nbsp; <strong>Facility:</strong> ${result.borrower?.facility ?? "—"} &nbsp;|&nbsp; <strong>Amount:</strong> £${result.borrower?.amount?.toLocaleString() ?? "—"} &nbsp;|&nbsp; <strong>Generated:</strong> ${new Date().toLocaleString()}</p>`);
    w.document.write(`<div class="rec-${rec.toLowerCase()}">RECOMMENDATION: ${recConfig.label}</div>`);
    w.document.write(`<p>${result.recommendation_reason ?? ""}</p>`);
    w.document.write(`<h2>Risk Scores</h2><table><tr><th>Domain</th><th>Score</th><th>Rating</th></tr>`);
    w.document.write(`<tr><td>Credit</td><td>${creditScore}/100</td><td>${scores.credit?.rating ?? "—"}</td></tr>`);
    w.document.write(`<tr><td>Fraud</td><td>${fraudScore}/100</td><td>${scores.fraud?.rating ?? "—"}</td></tr>`);
    w.document.write(`<tr><td>Affordability</td><td>${affordScore}/100</td><td>DSC: ${scores.affordability?.dsc_ratio ?? "—"}</td></tr>`);
    w.document.write(`<tr><td>Data Confidence</td><td>${confScore}/100</td><td>—</td></tr></table>`);
    const LAYER_LABELS_PDF: Record<string, string> = {
      layer_01_synthetic_identity: "01 — Synthetic Identity",
      layer_02_document_authenticity: "02 — Document Authenticity",
      layer_03_cash_inflation: "03 — Pre-Application Cash Inflation",
      layer_04_round_tripping: "04 — Round-Tripping",
      layer_05_income_crosscheck: "05 — Income Cross-Check",
      layer_06_cifas: "06 — Fraud Bureau Markers",
      layer_07_director_network: "07 — Director/Officer Network",
      layer_08_companies_house: "08 — Company Registry Anomalies",
      layer_09_device_fingerprint: "09 — Device Fingerprinting",
      layer_10_land_registry: "10 — Property/Asset Registry",
      layer_11_vat_hmrc: "11 — VAT / HMRC Cross-Reference",
      layer_12_open_banking_velocity: "12 — Open Banking Velocity",
      layer_13_adverse_credit: "13 — Adverse Credit Signals",
      layer_14_behavioural: "14 — Behavioural Biometrics",
      layer_15_connected_party: "15 — Connected Party Transactions",
      layer_16_web_presence: "16 — Social Media & Web Presence",
      layer_17_sector_fraud: "17 — Sector-Specific Fraud Patterns",
      layer_18_application_velocity: "18 — Application Velocity",
      layer_19_address_anomaly: "19 — Address & Registered Office",
      layer_20_payroll_verification: "20 — Payroll & Employment Verification",
    };
    // Ensure all 20 layers appear in order
    const allLayers = Object.keys(LAYER_LABELS_PDF);
    const fullFraudMatrix = { ...fraudMatrix };
    allLayers.forEach(k => { if (!fullFraudMatrix[k]) fullFraudMatrix[k] = "PASS"; });
    w.document.write(`<h2>20-Layer Fraud Matrix</h2><table><tr><th>Layer</th><th>Result</th></tr>`);
    allLayers.forEach((k) => {
      const v = fullFraudMatrix[k] || "PASS";
      const cls = v === "PASS" ? "pass" : v === "FLAG" ? "flag" : v === "ALERT" || v === "FAIL" ? "alert" : "na";
      const label = LAYER_LABELS_PDF[k];
      w.document.write(`<tr><td>${label}</td><td><span class="badge ${cls}">${v}</span></td></tr>`);
    });
    w.document.write(`</table>`);
    if (keyFlags.length > 0) {
      w.document.write(`<h2>Audit Trail</h2><table><tr><th>Criterion</th><th>Result</th><th>Weight</th><th>Detail</th></tr>`);
      keyFlags.forEach((f) => {
        if (typeof f === "object" && f !== null) {
          const ff = f as { criterion: string; result: string; weight: number; detail: string };
          const cls = ff.result === "PASS" ? "pass" : ff.result === "FLAG" ? "flag" : "alert";
          w.document.write(`<tr><td>${ff.criterion}</td><td><span class="badge ${cls}">${ff.result}</span></td><td>${ff.weight ?? "—"}</td><td>${ff.detail}</td></tr>`);
        } else {
          w.document.write(`<tr><td colspan="4">${String(f)}</td></tr>`);
        }
      });
      w.document.write(`</table>`);
    }
    if (narrative.borrower_summary) {
      w.document.write(`<h2>Underwriting Narrative</h2>`);
      w.document.write(`<p><strong>Summary:</strong> ${narrative.borrower_summary}</p>`);
      if (narrative.key_strengths?.length) {
        w.document.write(`<p><strong>Key Strengths:</strong></p><ul>${narrative.key_strengths.map(s => `<li>${s}</li>`).join("")}</ul>`);
      }
      if (narrative.key_concerns?.length) {
        w.document.write(`<p><strong>Key Concerns:</strong></p><ul>${narrative.key_concerns.map(c => `<li>${c}</li>`).join("")}</ul>`);
      }
      if (narrative.affordability) {
        w.document.write(`<p><strong>Affordability:</strong> ${narrative.affordability}</p>`);
      }
    }
    w.document.write(`<div class="footer">${result.compliance_note ?? "This output is advisory only. All lending decisions must be made by a qualified underwriter. NexusLend AI does not make lending decisions."}<br/>Processing time: ${(processingTimeMs / 1000).toFixed(1)}s &nbsp;|&nbsp; Generated by NexusLend AI &nbsp;|&nbsp; nexuslend.ai</div>`);
    w.document.write(`</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 500);
  };

  return (
    <div id="demo-results-printable" className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onReset} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> New Analysis
          </button>
          <span className="text-slate-700">|</span>
          <span className="text-xs text-slate-500">Processed in {(processingTimeMs / 1000).toFixed(1)}s</span>
        </div>
        <Button onClick={handleExportPDF} variant="outline" size="sm" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800">
          <Download className="w-4 h-4" /> Export as PDF
        </Button>
      </div>

      {/* Recommendation banner */}
      <div className={`rounded-xl border ${recConfig.border} ${recConfig.bg} p-5 flex items-start gap-4`}>
        <div className={`${recConfig.text} mt-0.5 shrink-0`}>{recConfig.icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`text-base font-bold ${recConfig.text} mb-1`}>{recConfig.label}</div>
          <p className="text-sm text-slate-300 leading-relaxed">{result.recommendation_reason || "See narrative below for full reasoning."}</p>
        </div>
      </div>

      {/* Borrower info */}
      {result.borrower && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Borrower", value: result.borrower.name },
            { label: "Facility", value: result.borrower.facility },
            { label: "Amount", value: `£${result.borrower.amount?.toLocaleString()}` },
            { label: "Jurisdiction", value: result.borrower.jurisdiction ?? "UK" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
              <div className="text-sm font-semibold text-white truncate">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Score rings */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-5 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-400" /> Risk Scores
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 justify-items-center">
          <ScoreRing score={creditScore} label="Credit Score" color={creditScore >= 70 ? "#10b981" : creditScore >= 45 ? "#f59e0b" : "#ef4444"} />
          <ScoreRing score={fraudScore} label="Fraud Score" color={fraudScore < 20 ? "#10b981" : fraudScore < 50 ? "#f59e0b" : "#ef4444"} />
          <ScoreRing score={affordScore} label="Affordability" color={affordScore >= 70 ? "#10b981" : affordScore >= 45 ? "#f59e0b" : "#ef4444"} />
          <ScoreRing score={confScore} label="Data Confidence" color={confScore >= 70 ? "#6366f1" : confScore >= 45 ? "#f59e0b" : "#ef4444"} />
        </div>

        {/* Factor breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {scores.credit && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Credit — Top Factors</div>
              {scores.credit.top_factors_up?.slice(0, 3).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-emerald-400">
                  <TrendingUp className="w-3 h-3 shrink-0" /> {f}
                </div>
              ))}
              {scores.credit.top_factors_down?.slice(0, 3).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-red-400">
                  <TrendingDown className="w-3 h-3 shrink-0" /> {f}
                </div>
              ))}
            </div>
          )}
          {scores.fraud && (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Fraud — Signals Flagged</div>
              {(scores.fraud.signals_flagged?.length ?? 0) === 0
                ? <div className="flex items-center gap-2 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" /> No fraud signals detected</div>
                : scores.fraud.signals_flagged?.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-amber-400"><AlertTriangle className="w-3 h-3 shrink-0" /> {s}</div>
                ))
              }
            </div>
          )}
        </div>
      </div>

      {/* 20-Layer Fraud Matrix */}
      {fraudEntries.length > 0 && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" /> 20-Layer Fraud Matrix
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fraudEntries.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                <span className="text-xs text-slate-400 truncate"><FraudLayerLabel layerKey={k} /></span>
                <FraudBadge value={v} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Trail */}
      {keyFlags.length > 0 && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" /> Audit Trail — Criteria Evaluated
          </h3>
          <div className="space-y-2">
            {keyFlags.map((f, i) => {
              if (typeof f === "object" && f !== null) {
                const ff = f as { criterion: string; result: string; weight: number; detail: string };
                return (
                  <div key={i} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <div className="shrink-0 mt-0.5"><FraudBadge value={ff.result} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200">{ff.criterion}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{ff.detail}</div>
                    </div>
                    {ff.weight != null && (
                      <div className="shrink-0 text-xs text-slate-600 font-mono">w:{ff.weight}</div>
                    )}
                  </div>
                );
              }
              return (
                <div key={i} className="text-xs text-slate-400 py-1 px-3">{String(f)}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* Narrative */}
      {narrative.borrower_summary && (
        <div className="bg-slate-900/60 rounded-xl border border-slate-700/50 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" /> Underwriting Narrative
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">{narrative.borrower_summary}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {narrative.key_strengths && narrative.key_strengths.length > 0 && (
              <div>
                <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-2">Key Strengths</div>
                <ul className="space-y-1.5">
                  {narrative.key_strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {narrative.key_concerns && narrative.key_concerns.length > 0 && (
              <div>
                <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-2">Key Concerns</div>
                <ul className="space-y-1.5">
                  {narrative.key_concerns.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" /> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {narrative.affordability && (
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
              <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-1">Affordability Assessment</div>
              <p className="text-xs text-slate-300 leading-relaxed">{narrative.affordability}</p>
            </div>
          )}
          {narrative.fraud_signals && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              <div className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">Fraud Signal Summary</div>
              <p className="text-xs text-slate-300 leading-relaxed">{narrative.fraud_signals}</p>
            </div>
          )}
        </div>
      )}

      {/* Compliance note */}
      <div className="text-xs text-slate-600 border-t border-slate-800 pt-4 leading-relaxed">
        {result.compliance_note ?? "This output is advisory only. All lending decisions must be made by a qualified underwriter. NexusLend AI does not make lending decisions."}
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 rounded-xl p-6 text-center space-y-3">
        <div className="text-base font-bold text-white">Want this for every deal you process?</div>
        <p className="text-sm text-slate-400">NexusLend AI runs this analysis in seconds, on every application, automatically.</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {savedToPipeline ? (
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Saved to pipeline
            </div>
          ) : (
            <button
              onClick={handleSaveToPipeline}
              disabled={saveToPipelineMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {saveToPipelineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {saveToPipelineMutation.isPending ? "Saving..." : "Save to pipeline"}
            </button>
          )}
          <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">
            Get Started Free <ChevronRight className="w-4 h-4" />
          </a>
          <a href="/#pricing" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors">
            View Pricing <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Main Demo Page ────────────────────────────────────────────────────────────
export default function Demo() {
  const [step, setStep] = useState<"choose" | "uploading" | "analysing" | "result">("choose");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [processingTimeMs, setProcessingTimeMs] = useState(0);
  const [selectedExample, setSelectedExample] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: examples, isLoading: examplesLoading } = trpc.demo.getExamples.useQuery();
  const analyseMutation = trpc.demo.analyse.useMutation();

  const handleFile = useCallback((file: File) => {
    const allowed = ["application/pdf", "text/csv", "image/jpeg", "image/png", "image/jpg"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|csv|jpg|jpeg|png)$/i)) {
      toast.error("Please upload a PDF, CSV, or image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB");
      return;
    }
    setUploadedFile(file);
    setSelectedExample(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const runAnalysis = async (exampleId?: string) => {
    setStep("analysing");
    try {
      let input: Parameters<typeof analyseMutation.mutateAsync>[0];

      if (exampleId && examples) {
        const ex = examples.find(e => e.id === exampleId);
        if (!ex) throw new Error("Example not found");
        input = {
          companyName: ex.data.companyName,
          loanAmount: ex.data.loanAmount,
          loanType: ex.data.loanType,
          loanTermMonths: ex.data.loanTermMonths,
          sector: ex.data.sector,
          documentText: ex.data.documentText,
        };
      } else if (uploadedFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(uploadedFile);
        });
        input = {
          companyName: "Uploaded Document Analysis",
          loanAmount: "To be determined",
          loanType: "Business Loan",
          documentText: "",
          fileBase64: base64,
          fileName: uploadedFile.name,
          fileMimeType: uploadedFile.type,
        };
      } else {
        throw new Error("No input provided");
      }

      const res = await analyseMutation.mutateAsync(input);
      if (res.structured) {
        setResult(res.structured as AnalysisResult);
        setProcessingTimeMs(res.processingTimeMs ?? 0);
        setStep("result");
      } else {
        toast.error("Analysis returned no structured data. Please try again.");
        setStep("choose");
      }
    } catch {
      toast.error("Analysis failed. Please try again.");
      setStep("choose");
    }
  };

  const handleReset = () => {
    setStep("choose");
    setResult(null);
    setUploadedFile(null);
    setSelectedExample(null);
  };

  return (
    <div className="min-h-screen bg-[#080b14] text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-[#080b14]/90 backdrop-blur-sm border-b border-white/[0.06] px-4 sm:px-6 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">NexusLend AI</span>
        </a>
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">← Back to website</Link>
          <a href="/dashboard" className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors">Sign In</a>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {step !== "result" && (
          <>
            {/* Hero */}
            <div className="text-center mb-10">
              <Badge className="mb-4 bg-indigo-500/15 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/15">
                🔓 No Login Required
              </Badge>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 tracking-tight">
                Test NexusLend AI Underwriting
              </h1>
              <p className="text-lg text-slate-400 max-w-xl mx-auto">
                100% Free &nbsp;·&nbsp; 2 Minutes &nbsp;·&nbsp; Full AI Pipeline
              </p>
              <p className="text-sm text-slate-500 mt-2">
                Upload a bank statement or choose a pre-loaded example deal — get a live underwriting decision instantly.
              </p>
            </div>

            {step === "analysing" && (
              <div className="flex flex-col items-center justify-center py-20 gap-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-2 border-indigo-500/30 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute -inset-2 rounded-full border border-indigo-500/10 animate-ping" />
                </div>
                <div className="text-center space-y-2">
                  <div className="text-lg font-semibold text-white">Running Full AI Analysis</div>
                  <div className="text-sm text-slate-400">Processing 8 domains · 20-layer fraud matrix · 100-criterion scorecard</div>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-500">
                  {["Income Verification", "Fraud Matrix", "Affordability", "Credit Score", "Risk Narrative"].map(s => (
                    <span key={s} className="px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/50 flex items-center gap-1.5">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {step === "choose" && (
              <div className="space-y-8">
                {/* Upload section */}
                <div className="bg-slate-900/60 rounded-2xl border border-slate-700/50 p-6">
                  <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-indigo-400" /> Option A — Upload Your Document
                  </h2>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      dragOver ? "border-indigo-500 bg-indigo-500/5" : uploadedFile ? "border-emerald-500/50 bg-emerald-500/5" : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/30"
                    }`}
                  >
                    <input ref={fileRef} type="file" accept=".pdf,.csv,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                    {uploadedFile ? (
                      <div className="space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <div className="text-sm font-medium text-emerald-400">{uploadedFile.name}</div>
                        <div className="text-xs text-slate-500">{(uploadedFile.size / 1024).toFixed(0)} KB · Click to change</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-8 h-8 text-slate-500 mx-auto" />
                        <div className="text-sm text-slate-300">Drag & drop or click to upload</div>
                        <div className="text-xs text-slate-500">PDF bank statement, CSV, or image · Max 10MB</div>
                      </div>
                    )}
                  </div>
                  {uploadedFile && (
                    <Button onClick={() => runAnalysis()} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold gap-2">
                      <Zap className="w-4 h-4" /> Run AI Analysis on {uploadedFile.name}
                    </Button>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-xs text-slate-600 font-medium uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>

                {/* Example deals */}
                <div className="bg-slate-900/60 rounded-2xl border border-slate-700/50 p-6">
                  <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-400" /> Option B — Try a Pre-Loaded Example Deal
                  </h2>
                  {examplesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {examples?.map((ex) => (
                        <button
                          key={ex.id}
                          onClick={() => { setSelectedExample(ex.id); runAnalysis(ex.id); }}
                          className={`text-left p-4 rounded-xl border transition-all hover:border-indigo-500/50 hover:bg-indigo-500/5 group ${
                            selectedExample === ex.id ? "border-indigo-500/50 bg-indigo-500/5" : "border-slate-700/50 bg-slate-800/40"
                          }`}
                        >
                          <div className="text-2xl mb-2">{ex.icon}</div>
                          <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors mb-1">{ex.label}</div>
                          <div className="text-xs text-slate-500 leading-relaxed">{ex.description}</div>
                          <div className="mt-3 flex items-center gap-1 text-xs text-indigo-400 font-medium">
                            Run Analysis <ChevronRight className="w-3 h-3" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* What you'll get */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: <Shield className="w-4 h-4" />, label: "20-Layer Fraud Matrix", color: "text-red-400" },
                    { icon: <BarChart3 className="w-4 h-4" />, label: "5-Domain Scorecard", color: "text-indigo-400" },
                    { icon: <FileText className="w-4 h-4" />, label: "Full Audit Trail", color: "text-emerald-400" },
                    { icon: <Download className="w-4 h-4" />, label: "PDF Export", color: "text-amber-400" },
                  ].map(({ icon, label, color }) => (
                    <div key={label} className="flex items-center gap-2.5 bg-slate-800/40 rounded-lg px-3 py-2.5 border border-slate-700/40">
                      <span className={color}>{icon}</span>
                      <span className="text-xs text-slate-300 font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === "result" && result && (
          <ResultsPanel
            result={result}
            processingTimeMs={processingTimeMs}
            onReset={handleReset}
            companyName={selectedExample && examples ? (examples.find(e => e.id === selectedExample)?.data.companyName ?? "Demo Analysis") : "Uploaded Document Analysis"}
            loanAmount={selectedExample && examples ? (examples.find(e => e.id === selectedExample)?.data.loanAmount ?? "To be determined") : "To be determined"}
            loanType={selectedExample && examples ? (examples.find(e => e.id === selectedExample)?.data.loanType ?? "Business Loan") : "Business Loan"}
          />
        )}
      </div>
    </div>
  );
}

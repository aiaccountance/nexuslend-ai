import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── GA4 event helper ────────────────────────────────────────────────────────
function gaEvent(eventName: string, params?: Record<string, string>) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.gtag === "function") {
      w.gtag("event", eventName, params || {});
    }
  } catch {
    // non-fatal
  }
}

// ─── Calendly popup helper ────────────────────────────────────────────────────
function openCalendly() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.Calendly) {
      w.Calendly.initPopupWidget({
        url: "https://calendly.com/aryehleiblazarus18/new-meeting",
      });
    } else {
      // Fallback: open in new tab if Calendly script hasn't loaded
      window.open(
        "https://calendly.com/aryehleiblazarus18/new-meeting",
        "_blank"
      );
    }
  } catch {
    window.open(
      "https://calendly.com/aryehleiblazarus18/new-meeting",
      "_blank"
    );
  }
}

function handleBookDemo() {
  gaEvent("book_demo_click", { cta_location: "page" });
  openCalendly();
}

function handleStartTrial() {
  gaEvent("start_free_trial_click", { cta_location: "page" });
  // Route to dashboard — user will be prompted to sign in there
  window.location.href = "/dashboard";
}

// ─── Score ring component ─────────────────────────────────────────────────────
function ScoreRing({
  score,
  label,
  color,
}: {
  score: number;
  label: string;
  color: string;
}) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke="rgba(57,255,20,0.1)"
            strokeWidth="8"
          />
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>
            {score}
          </span>
        </div>
      </div>
      <span className="text-xs text-center text-[#7a9a7a] font-medium leading-tight">
        {label}
      </span>
    </div>
  );
}

// ─── Fraud layer badge ────────────────────────────────────────────────────────
function FraudBadge({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  if (s === "PASS")
    return (
      <span className="fraud-pass text-xs px-2 py-0.5 rounded font-semibold bg-green-900/30 text-green-400">
        PASS
      </span>
    );
  if (s === "FLAG")
    return (
      <span className="fraud-flag text-xs px-2 py-0.5 rounded font-semibold bg-yellow-900/30 text-yellow-400">
        FLAG
      </span>
    );
  if (s === "FAIL")
    return (
      <span className="fraud-fail text-xs px-2 py-0.5 rounded font-semibold bg-red-900/40 text-red-400">
        FAIL
      </span>
    );
  if (s === "ALERT")
    return (
      <span className="fraud-alert text-xs px-2 py-0.5 rounded font-semibold bg-red-900/30 text-red-400">
        ALERT
      </span>
    );
  if (s === "BETA")
    return (
      <span className="fraud-na text-xs px-2 py-0.5 rounded bg-gray-900/30 text-gray-400">
        BETA
      </span>
    );
  if (s === "REQUIRES_SESSION_DATA")
    return (
      <span className="fraud-na text-xs px-2 py-0.5 rounded bg-gray-900/30 text-gray-400">
        SESSION
      </span>
    );
  if (s.includes("REQUIRES") || s === "N/A" || s === "")
    return (
      <span className="fraud-na text-xs px-2 py-0.5 rounded bg-blue-900/30 text-blue-400">
        NO VAT
      </span>
    );
  return (
    <span className="fraud-na text-xs px-2 py-0.5 rounded bg-gray-900/30 text-gray-400">
      {status.slice(0, 8)}
    </span>
  );
}

// ─── Analyser result panel ────────────────────────────────────────────────────
function AnalyserResult({ data }: { data: Record<string, unknown> }) {
  const [auditOpen, setAuditOpen] = useState(false);
  const scores = data.scores as
    | Record<string, Record<string, unknown>>
    | undefined;
  const fraudMatrix = data.fraud_matrix as Record<string, string> | undefined;
  const narrative = data.narrative as Record<string, unknown> | undefined;
  const recommendation = (data.recommendation as string) || "REVIEW";
  const recReason = (data.recommendation_reason as string) || "";
  const keyFlags = Array.isArray(data.key_flags)
    ? (data.key_flags as string[])
    : [];
  const complianceNote =
    (data.compliance_note as string) ||
    "This output is advisory only. All lending decisions must be made by a qualified underwriter. NexusLend AI does not make lending decisions. FCA Consumer Duty applies.";

  // Overall underwriting score: average of the 5 sub-scores
  const subScores = [
    {
      key: "cash_flow",
      label: "Cash Flow Health",
      val: Number(scores?.cash_flow?.score ?? scores?.credit?.score ?? 0),
    },
    {
      key: "debt_service",
      label: "Debt Service Capacity",
      val: Number(
        scores?.debt_service?.score ?? scores?.affordability?.score ?? 0
      ),
    },
    {
      key: "fraud_risk",
      label: "Fraud Risk",
      val: 100 - Number(scores?.fraud?.score ?? 0),
    },
    {
      key: "business_stability",
      label: "Business Stability",
      val: Number(
        scores?.business_stability?.score ?? scores?.data_confidence?.score ?? 0
      ),
    },
    {
      key: "loan_viability",
      label: "Loan Viability",
      val: Number(scores?.loan_viability?.score ?? scores?.credit?.score ?? 0),
    },
  ];
  const overallScore = Math.round(
    subScores.reduce((a, s) => a + s.val, 0) / subScores.length
  );

  // Fraud risk summary
  const fraudScore = Number(scores?.fraud?.score ?? 0);
  const fraudRiskLevel =
    fraudScore < 25 ? "GREEN" : fraudScore < 55 ? "AMBER" : "RED";
  const fraudRiskColor =
    fraudRiskLevel === "GREEN"
      ? "#39ff14"
      : fraudRiskLevel === "AMBER"
        ? "#fbbf24"
        : "#ef4444";
  const fraudRiskBg =
    fraudRiskLevel === "GREEN"
      ? "rgba(57,255,20,0.08)"
      : fraudRiskLevel === "AMBER"
        ? "rgba(251,191,36,0.08)"
        : "rgba(239,68,68,0.08)";
  const fraudRiskBorder =
    fraudRiskLevel === "GREEN"
      ? "rgba(57,255,20,0.25)"
      : fraudRiskLevel === "AMBER"
        ? "rgba(251,191,36,0.25)"
        : "rgba(239,68,68,0.25)";
  const fraudReason =
    ((scores?.fraud as Record<string, unknown>)?.reason as string) ||
    (fraudRiskLevel === "GREEN"
      ? "No significant fraud signals detected."
      : fraudRiskLevel === "AMBER"
        ? "Some anomalies detected — manual review recommended."
        : "Multiple fraud signals flagged — high risk.");

  const recClass =
    recommendation === "PROCEED"
      ? "recommendation-proceed"
      : recommendation === "DECLINE"
        ? "recommendation-decline"
        : "recommendation-review";

  const fraudLayers = [
    { key: "layer_01_synthetic_identity", label: "01 — Synthetic Identity" },
    {
      key: "layer_02_document_authenticity",
      label: "02 — Document Authenticity",
    },
    {
      key: "layer_03_cash_inflation",
      label: "03 — Pre-Application Cash Inflation",
    },
    { key: "layer_04_round_tripping", label: "04 — Round-Tripping" },
    { key: "layer_05_income_crosscheck", label: "05 — Income Cross-Check" },
    { key: "layer_06_cifas", label: "06 — CIFAS Markers" },
    { key: "layer_07_director_network", label: "07 — Director Network" },
    {
      key: "layer_08_companies_house",
      label: "08 — Companies House Anomalies",
    },
    { key: "layer_09_device_fingerprint", label: "09 — Device Fingerprinting" },
    { key: "layer_10_land_registry", label: "10 — Land Registry Charges" },
    { key: "layer_11_vat_hmrc", label: "11 — VAT / HMRC Cross-Reference" },
    {
      key: "layer_12_open_banking_velocity",
      label: "12 — Open Banking Velocity",
    },
    {
      key: "layer_13_adverse_credit",
      label: "13 — Adverse Credit / CCJ Mapping",
    },
    { key: "layer_14_behavioural", label: "14 — Behavioural Biometrics" },
    {
      key: "layer_15_connected_party",
      label: "15 — Connected Party Transactions",
    },
    { key: "layer_16_web_presence", label: "16 — Social Media & Web Presence" },
    {
      key: "layer_17_sector_fraud",
      label: "17 — Sector-Specific Fraud Patterns",
    },
    {
      key: "layer_18_application_velocity",
      label: "18 — Application Velocity",
    },
    {
      key: "layer_19_address_anomaly",
      label: "19 — Address & Registered Office",
    },
    {
      key: "layer_20_payroll_verification",
      label: "20 — Payroll & Employment Verification",
    },
  ];

  return (
    <div className="mt-8 space-y-5">
      {/* Decision banner */}
      <div className={`rounded-xl p-5 ${recClass}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {recommendation === "PROCEED"
              ? "✅"
              : recommendation === "DECLINE"
                ? "🚫"
                : "⚠️"}
          </span>
          <div>
            <div className="font-bold text-lg tracking-wide">
              Decision: {recommendation}
            </div>
            {recReason && (
              <div className="text-sm mt-0.5 opacity-90">{recReason}</div>
            )}
          </div>
        </div>
      </div>

      {/* Overall underwriting score + fraud risk summary row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Overall score */}
        <div className="card-dark p-4 flex flex-col items-center justify-center">
          <div className="text-xs font-semibold text-[#7a9a7a] uppercase tracking-widest mb-2">
            Underwriting Score
          </div>
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
              <circle
                cx="44"
                cy="44"
                r="36"
                fill="none"
                stroke="rgba(57,255,20,0.1)"
                strokeWidth="8"
              />
              <circle
                cx="44"
                cy="44"
                r="36"
                fill="none"
                stroke={
                  overallScore >= 60
                    ? "#39ff14"
                    : overallScore >= 40
                      ? "#fbbf24"
                      : "#ef4444"
                }
                strokeWidth="8"
                strokeDasharray={`${(overallScore / 100) * 2 * Math.PI * 36} ${2 * Math.PI * 36}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-2xl font-black"
                style={{
                  color:
                    overallScore >= 60
                      ? "#39ff14"
                      : overallScore >= 40
                        ? "#fbbf24"
                        : "#ef4444",
                }}
              >
                {overallScore}
              </span>
            </div>
          </div>
          <div className="text-xs text-[#7a9a7a] mt-1">out of 100</div>
        </div>

        {/* Fraud risk */}
        <div
          className="card-dark p-4 flex flex-col items-center justify-center"
          style={{
            background: fraudRiskBg,
            borderColor: fraudRiskBorder,
            border: `1px solid ${fraudRiskBorder}`,
          }}
        >
          <div className="text-xs font-semibold text-[#7a9a7a] uppercase tracking-widest mb-2">
            Fraud Risk
          </div>
          <div
            className="text-3xl font-black mb-1"
            style={{ color: fraudRiskColor }}
          >
            {fraudRiskLevel}
          </div>
          <div className="text-xs text-[#b0c4b0] text-center leading-tight">
            {fraudReason}
          </div>
        </div>
      </div>

      {/* 5 sub-scores */}
      <div>
        <h3 className="text-xs font-semibold text-[#7a9a7a] uppercase tracking-widest mb-3">
          5-Category Scorecard
        </h3>
        <div className="space-y-2">
          {subScores.map(s => (
            <div key={s.key} className="flex items-center gap-3">
              <div className="text-xs text-[#b0c4b0] w-36 shrink-0">
                {s.label}
              </div>
              <div className="flex-1 bg-[rgba(57,255,20,0.06)] rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${s.val}%`,
                    background:
                      s.val >= 60
                        ? "#39ff14"
                        : s.val >= 40
                          ? "#fbbf24"
                          : "#ef4444",
                  }}
                />
              </div>
              <div
                className="text-xs font-bold w-8 text-right"
                style={{
                  color:
                    s.val >= 60
                      ? "#39ff14"
                      : s.val >= 40
                        ? "#fbbf24"
                        : "#ef4444",
                }}
              >
                {s.val}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key flags */}
      <div className="card-dark p-4">
        <h3 className="text-xs font-semibold text-[#7a9a7a] uppercase tracking-widest mb-3">
          Key Flags
        </h3>
        {keyFlags.length > 0 ? (
          <ul className="space-y-1.5">
            {keyFlags.map((flag, i) => {
              const isRisk =
                /risk|concern|flag|alert|missing|decline|adverse|high|low|insufficient|no |not /i.test(
                  flag
                );
              return (
                <li key={i} className="text-xs flex gap-2 items-start">
                  <span
                    className={isRisk ? "text-[#fbbf24]" : "text-[#39ff14]"}
                  >
                    {isRisk ? "⚠" : "✓"}
                  </span>
                  <span className="text-[#e8f5e9]">{flag}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-[#7a9a7a]">None detected.</p>
        )}
      </div>

      {/* Narrative */}
      {narrative && (
        <div className="card-dark p-5 space-y-4">
          <h3 className="text-xs font-semibold text-[#7a9a7a] uppercase tracking-widest">
            Underwriting Narrative
          </h3>
          {!!narrative.borrower_summary && (
            <div>
              <div className="text-xs text-[#7a9a7a] uppercase tracking-wide mb-1">
                Borrower Summary
              </div>
              <p className="text-sm text-[#e8f5e9]">
                {String(narrative.borrower_summary)}
              </p>
            </div>
          )}
          {Array.isArray(narrative.key_strengths) &&
            narrative.key_strengths.length > 0 && (
              <div>
                <div className="text-xs text-[#39ff14] uppercase tracking-wide mb-1">
                  Key Strengths
                </div>
                <ul className="space-y-1">
                  {(narrative.key_strengths as string[]).map((s, i) => (
                    <li key={i} className="text-sm text-[#e8f5e9] flex gap-2">
                      <span className="text-[#39ff14]">✓</span>
                      {String(s)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {Array.isArray(narrative.key_concerns) &&
            narrative.key_concerns.length > 0 && (
              <div>
                <div className="text-xs text-[#fbbf24] uppercase tracking-wide mb-1">
                  Key Concerns
                </div>
                <ul className="space-y-1">
                  {(narrative.key_concerns as string[]).map((c, i) => (
                    <li key={i} className="text-sm text-[#e8f5e9] flex gap-2">
                      <span className="text-[#fbbf24]">⚠</span>
                      {String(c)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {!!narrative.affordability && (
            <div>
              <div className="text-xs text-[#7a9a7a] uppercase tracking-wide mb-1">
                Affordability
              </div>
              <p className="text-sm text-[#e8f5e9]">
                {String(narrative.affordability)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Expandable full audit trail */}
      {fraudMatrix && (
        <div>
          <button
            onClick={() => setAuditOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[rgba(57,255,20,0.15)] bg-[rgba(57,255,20,0.03)] text-xs font-semibold text-[#7a9a7a] hover:border-[rgba(57,255,20,0.3)] transition-all"
          >
            <span>🔍 Full Audit Trail — 20-Layer Fraud Signal Matrix</span>
            <span>{auditOpen ? "▲ Hide" : "▼ Expand"}</span>
          </button>
          {auditOpen && (
            <div className="mt-2 card-dark p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {fraudLayers.map(layer => {
                const liveChecks = data.live_checks as
                  | Record<string, Record<string, string>>
                  | undefined;
                const liveDetail =
                  liveChecks?.[
                    layer.key === "layer_07_director_network"
                      ? "layer_07"
                      : layer.key === "layer_08_companies_house"
                        ? "layer_08"
                        : layer.key === "layer_09_device_fingerprint"
                          ? "layer_09"
                          : ""
                  ]?.detail;
                return (
                  <div
                    key={layer.key}
                    className="flex items-start justify-between py-1.5 border-b border-[rgba(57,255,20,0.07)] last:border-0 gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-[#b0c4b0]">
                        {layer.label}
                      </span>
                      {liveDetail && (
                        <div
                          className="text-[10px] text-[#7a9a7a] mt-0.5 truncate"
                          title={liveDetail}
                        >
                          ↳ {liveDetail.slice(0, 60)}
                          {liveDetail.length > 60 ? "…" : ""}
                        </div>
                      )}
                    </div>
                    <FraudBadge
                      status={fraudMatrix[layer.key] ?? "REQUIRES_LIVE_API"}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FCA compliance note */}
      <div className="rounded-lg border border-[rgba(57,255,20,0.1)] bg-[rgba(57,255,20,0.03)] p-4">
        <p className="text-xs text-[#7a9a7a] leading-relaxed">
          <span className="text-[#39ff14] font-semibold">
            ⚖ FCA Compliance Note —{" "}
          </span>
          {complianceNote}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  // Nav state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Analyser state
  const [companyName, setCompanyName] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanType, setLoanType] = useState("Business Loan");
  const [vatNumber, setVatNumber] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<
    { name: string; text: string; base64?: string; mimeType?: string }[]
  >([]);
  const [analyserResultOpen, setAnalyserResultOpen] = useState(false);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const bankRef = useRef<HTMLInputElement>(null);
  const accountsRef = useRef<HTMLInputElement>(null);
  const directorRef = useRef<HTMLInputElement>(null);
  const vatRef = useRef<HTMLInputElement>(null);

  // Contact form state
  const [contactForm, setContactForm] = useState({
    fullName: "",
    company: "",
    email: "",
    phone: "",
    interest: "",
    message: "",
  });

  // Pricing tab
  const [pricingAnnual, setPricingAnnual] = useState(false);

  // Platform module tab
  const [activeModule, setActiveModule] = useState("fraud");

  // How it works tab
  const [activeStep, setActiveStep] = useState(0);

  // tRPC mutations
  const analysePublicMutation = trpc.analyser.analysePublic.useMutation();
  const saveToPipelineMutation = trpc.analyser.saveToPipeline.useMutation();
  const contactMutation = trpc.contact.submit.useMutation();
  const [savedToPipeline, setSavedToPipeline] = useState(false);

  const handleSaveToPipeline = async () => {
    if (!analysePublicMutation.data) return;
    const structured =
      (analysePublicMutation.data.structured as Record<string, unknown>) || {};
    try {
      const result = await saveToPipelineMutation.mutateAsync({
        companyName,
        loanAmount,
        loanType,
        structured,
        rawText: analysePublicMutation.data.rawText,
      });
      if (result.success) {
        setSavedToPipeline(true);
        toast.success("Deal saved to your pipeline! Log in to view it.");
      } else {
        toast.error("Could not save to pipeline. Please try again.");
      }
    } catch {
      toast.error("Could not save to pipeline. Please try again.");
    }
  };

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: {
      name: string;
      text: string;
      base64?: string;
      mimeType?: string;
    }[] = [];
    for (const file of Array.from(files)) {
      const base64 = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.readAsDataURL(file);
      });
      if (file.type === "text/csv" || file.name.endsWith(".csv")) {
        const text = await file.text();
        newFiles.push({
          name: file.name,
          text: `[CSV: ${file.name}]\n${text.slice(0, 3000)}`,
          base64,
          mimeType: "text/csv",
        });
      } else {
        newFiles.push({
          name: file.name,
          text: `[Document: ${file.name} (${(file.size / 1024).toFixed(0)}KB)]`,
          base64,
          mimeType: file.type || "application/octet-stream",
        });
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
  }, []);

  // ── Example deal loader ────────────────────────────────────────────────────
  const loadExample = (type: "mca" | "bridging" | "high-risk") => {
    setUploadedFiles([]);
    if (type === "mca") {
      setCompanyName("Acme Retail Ltd");
      setLoanAmount("£45,000");
      setLoanType("Merchant Cash Advance");
    } else if (type === "bridging") {
      setCompanyName("Greenfield Developments Ltd");
      setLoanAmount("£320,000");
      setLoanType("Bridging Finance");
    } else {
      setCompanyName("QuickCash Trading Ltd");
      setLoanAmount("£80,000");
      setLoanType("Business Loan");
    }
    setAnalyserResultOpen(false);
    setSavedToPipeline(false);
    // Auto-scroll to form
    setTimeout(
      () =>
        document
          .getElementById("analyser")
          ?.scrollIntoView({ behavior: "smooth" }),
      100
    );
  };

  const handleRunAnalysis = async () => {
    if (!companyName.trim()) {
      toast.error("Please enter a company or applicant name.");
      return;
    }
    if (!loanAmount.trim()) {
      toast.error("Please enter the loan amount requested.");
      return;
    }

    gaEvent("run_free_ai_analysis", { company: companyName });
    setAnalyserResultOpen(false);
    setSavedToPipeline(false);

    // Use first uploaded file for base64 extraction; concatenate text for the rest
    const firstFile = uploadedFiles[0];
    const documentText = uploadedFiles
      .slice(1)
      .map(f => f.text)
      .join("\n\n---\n\n");

    try {
      await analysePublicMutation.mutateAsync({
        companyName,
        loanAmount,
        loanType,
        documentText,
        fileBase64: firstFile?.base64,
        fileName: firstFile?.name,
        mimeType: firstFile?.mimeType,
        vatNumber: vatNumber.trim() || undefined,
      });
      setAnalyserResultOpen(true);
      setTimeout(
        () =>
          document
            .getElementById("analyser-results")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        200
      );
    } catch (err) {
      toast.error("Analysis failed. Please try again.");
      console.error(err);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await contactMutation.mutateAsync(contactForm);
      toast.success("Message sent! We'll be in touch within 24 hours.");
      setContactForm({
        fullName: "",
        company: "",
        email: "",
        phone: "",
        interest: "",
        message: "",
      });
    } catch {
      toast.error(
        "Failed to send message. Please email us directly at hello@nexuslend.ai"
      );
    }
  };

  // ── Pricing values ─────────────────────────────────────────────────────────
  // Annual prices: £499×12=£5,988 → £4,790 (save 20%); £999×12=£11,988 → £9,590 (save 20%)
  const starterPrice = pricingAnnual ? "£399" : "£499";
  const starterAnnual = "£4,790";
  const growthPrice = pricingAnnual ? "£833" : "£999";
  const growthAnnual = "£9,590";

  // ── Platform modules ───────────────────────────────────────────────────────
  const modules = {
    fraud: {
      icon: "🛡️",
      label: "Fraud Detection",
      badge: "Live AI",
      title: "20-Layer Fraud Signal Matrix",
      desc: "Every application is cross-referenced against 20 fraud signal categories — from document metadata tampering to director disqualification, CIFAS markers, application velocity, connected party transactions, and payroll verification. Results are colour-coded GREEN / AMBER / RED with a full terminal-style audit log.",
      features: [
        "Document authenticity verification",
        "Director disqualification & CCJ checks",
        "CIFAS marker cross-reference",
        "Bank statement metadata analysis",
        "Behavioural pattern anomalies",
        "Address & identity consistency checks",
      ],
    },
    underwriting: {
      icon: "🧠",
      label: "AI Underwriting",
      badge: "Live AI",
      title: "100-Criterion AI Scorecard",
      desc: "NexusLend AI applies 100 underwriting criteria across income, expenditure, cash flow, business health, and sector benchmarks. Every decision includes a full explainability report for FCA Consumer Duty compliance.",
      features: [
        "Income verification & categorisation",
        "Expenditure analysis & committed spend",
        "Cash flow health scoring",
        "Affordability stress testing (+3%)",
        "FCA Consumer Duty explainability",
        "Sector benchmark comparison",
      ],
    },
    documents: {
      icon: "📄",
      label: "Document Analyser",
      badge: "Live AI",
      title: "Auto-Classification in Seconds",
      desc: "Brokers and applicants upload bank statements, filed accounts, director IDs, and VAT returns. NexusLend AI instantly classifies, names, and routes every file — no manual sorting, no lost documents.",
      features: [
        "Auto-classification of 14 document types",
        "Duplicate detection and version control",
        "Broker-facing upload portal",
        "Supports PDF, image, and CSV formats",
        "Metadata integrity checks",
        "Secure in-session processing",
      ],
    },
    pipeline: {
      icon: "📊",
      label: "Deal Pipeline",
      badge: "CRM",
      title: "Full Pipeline Visibility",
      desc: "Track every application from submission to decision in a single view. Automated status updates, broker notifications, and decision audit trails keep your team aligned without manual chasing.",
      features: [
        "Kanban deal board with status tracking",
        "Automated broker notifications",
        "Decision audit trail",
        "SLA monitoring and alerts",
        "Custom workflow stages",
        "Reporting and analytics dashboard",
      ],
    },
  };

  const howItWorksSteps = [
    {
      icon: "📥",
      label: "Document Intake",
      step: "Step 1",
      title: "Structured Intake in Seconds",
      desc: "Brokers and applicants upload bank statements, filed accounts, director IDs, and VAT returns through a branded portal. NexusLend AI instantly classifies, names, and routes every file — no manual sorting, no lost documents.",
      features: [
        "Auto-classification of 14 document types",
        "Duplicate detection and version control",
        "Broker-facing upload portal with progress tracking",
        "Supports PDF, image, and CSV formats",
      ],
    },
    {
      icon: "🧠",
      label: "AI Analysis",
      step: "Step 2",
      title: "8-Domain AI Analysis",
      desc: "The AI engine runs all 8 analytical domains simultaneously — income verification, expenditure analysis, cash flow health, fraud detection, affordability, business health, risk scoring, and underwriting narrative — in under 3 seconds.",
      features: [
        "20-layer fraud signal matrix",
        "100-criterion underwriting scorecard",
        "FCA Consumer Duty affordability check",
        "Explainable AI factor breakdown",
      ],
    },
    {
      icon: "✅",
      label: "Decision",
      step: "Step 3",
      title: "Structured Advisory Output",
      desc: "The underwriter receives a structured report: four risk scores, a 20-layer fraud matrix, a plain-English narrative, and a PROCEED / REVIEW / DECLINE recommendation — all in one screen.",
      features: [
        "Credit, Fraud, Affordability, and Data Confidence scores",
        "Full fraud matrix with layer-by-layer results",
        "Plain-English underwriting narrative",
        "FCA-compliant compliance note",
      ],
    },
    {
      icon: "📊",
      label: "Reporting",
      step: "Step 4",
      title: "Audit Trail & Reporting",
      desc: "Every decision is logged with a full audit trail — who ran the analysis, what data was used, and what the AI recommended. Portfolio-level reporting tracks approval rates, fraud catch rates, and cost per decision.",
      features: [
        "Immutable decision audit log",
        "Portfolio performance dashboard",
        "Fraud catch rate tracking",
        "Cost-per-decision analytics",
      ],
    },
  ];

  return (
    <div
      className="min-h-screen bg-[#0a0f0a] text-[#e8f5e9]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* ── Announcement bar ─────────────────────────────────────────────── */}
      <div className="bg-[#39ff14] text-[#0a0f0a] text-xs font-semibold py-2 text-center">
        🇬🇧 83% of UK lenders will increase AI budgets in 2026 — Is your
        operation ready?{" "}
        <a href="#analyser" className="underline hover:no-underline ml-1">
          Get a free analysis →
        </a>
      </div>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#0a0f0a]/95 backdrop-blur border-b border-[rgba(57,255,20,0.12)]">
        <div className="container flex items-center justify-between h-16">
          <a
            href="/"
            className="flex items-center gap-2 font-black text-xl tracking-tight"
          >
            <span className="w-7 h-7 rounded bg-[#39ff14] flex items-center justify-center text-[#0a0f0a] text-sm font-black">
              N
            </span>
            <span>
              NexusLend <span className="text-[#39ff14]">AI</span>
            </span>
          </a>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-[#b0c4b0]">
            <a
              href="#platform"
              className="hover:text-[#39ff14] transition-colors"
            >
              Platform
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#39ff14] transition-colors"
            >
              How It Works
            </a>
            <a
              href="#results"
              className="hover:text-[#39ff14] transition-colors"
            >
              Results
            </a>
            <a
              href="#pricing"
              className="hover:text-[#39ff14] transition-colors"
            >
              Pricing
            </a>
            <a
              href="#contact"
              className="hover:text-[#39ff14] transition-colors"
            >
              Contact
            </a>
            <a
              href="/demo"
              className="text-[#39ff14] font-semibold hover:text-white transition-colors border border-[rgba(57,255,20,0.3)] px-3 py-1 rounded-lg text-xs"
            >
              Try Demo
            </a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {/* Sign In → routes to dashboard (OAuth handled there) */}
            <a
              href="/dashboard"
              className="text-sm font-medium text-[#b0c4b0] hover:text-[#39ff14] transition-colors px-3 py-1.5"
            >
              Sign In
            </a>
            {/* Get Started → scrolls to pricing */}
            <button
              onClick={handleStartTrial}
              className="neon-btn text-sm px-4 py-2 rounded-lg"
            >
              Get Started
            </button>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-[#39ff14] p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#111811] border-t border-[rgba(57,255,20,0.12)] px-4 py-4 space-y-3">
            {[
              "#platform",
              "#how-it-works",
              "#results",
              "#pricing",
              "#contact",
            ].map((href, i) => (
              <a
                key={href}
                href={href}
                className="block text-sm text-[#b0c4b0] hover:text-[#39ff14] py-1"
                onClick={() => setMobileMenuOpen(false)}
              >
                {
                  ["Platform", "How It Works", "Results", "Pricing", "Contact"][
                    i
                  ]
                }
              </a>
            ))}
            <div className="pt-2 flex flex-col gap-2">
              <a
                href="/demo"
                className="text-sm text-center text-[#39ff14] font-semibold border border-[rgba(57,255,20,0.3)] rounded-lg py-2"
              >
                Try Demo Free
              </a>
              <a
                href="#"
                onClick={e => {
                  e.preventDefault();
                  handleBookDemo();
                }}
                className="text-sm text-center text-[#b0c4b0] border border-[rgba(57,255,20,0.2)] rounded-lg py-2"
              >
                Book Demo
              </a>
              <button
                onClick={handleStartTrial}
                className="neon-btn text-sm rounded-lg py-2"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-24">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(57,255,20,0.06)_0%,transparent_60%)]" />
        <div className="container relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#39ff14] bg-[rgba(57,255,20,0.08)] border border-[rgba(57,255,20,0.2)] rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-pulse" />
              UK ALTERNATIVE LENDING AUTOMATION
            </div>

            <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6">
              Accurately Assess.
              <br />
              <span className="text-[#39ff14]">Confidently Decide.</span>
              <br />
              Perpetually Optimise.
            </h1>

            <p className="text-lg text-[#b0c4b0] max-w-2xl mb-8 leading-relaxed">
              NexusLend AI automates the entire lending workflow for UK
              alternative lenders — from document intake to underwritten
              decision, without adding headcount.
            </p>

            <div className="flex flex-wrap gap-4 mb-10">
              <a
                href="#analyser"
                className="neon-btn px-6 py-3 rounded-xl text-base font-bold"
                onClick={() => gaEvent("get_free_analysis_click")}
              >
                Get a Free Analysis
              </a>
              <button
                onClick={handleBookDemo}
                className="px-6 py-3 rounded-xl text-base font-semibold border border-[rgba(57,255,20,0.3)] text-[#39ff14] hover:bg-[rgba(57,255,20,0.05)] transition-colors"
              >
                ▶ Watch 2-Min Demo
              </button>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#7a9a7a]">
              {[
                "✓ SOC 2 Type II",
                "✓ FCA-Aware AI",
                "✓ GDPR Ready",
                "✓ UK-Built",
                "✓ 14-Day Free Trial — No Card Required",
              ].map(t => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>

          {/* Platform performance card */}
          <div className="mt-12 card-dark p-6 max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-[#b0c4b0]">
                Platform Performance
              </span>
              <span className="text-xs text-[#39ff14] bg-[rgba(57,255,20,0.1)] px-2 py-0.5 rounded-full">
                Live
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { val: "12,400+", label: "Decisions automated monthly" },
                { val: "80%", label: "Reduction in manual work" },
                { val: "91%", label: "Automation rate" },
                { val: "35%", label: "Cost reduction" },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-2xl font-black text-[#39ff14]">
                    {s.val}
                  </div>
                  <div className="text-xs text-[#7a9a7a] mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-[rgba(57,255,20,0.1)] flex items-center gap-2 text-xs text-[#7a9a7a]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#39ff14] animate-pulse" />
              Live Processing Engine · &lt; 3s avg decision
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────────────────────── */}
      <div className="overflow-hidden border-y border-[rgba(57,255,20,0.1)] bg-[#0d150d] py-3">
        <div className="ticker-track flex whitespace-nowrap gap-12 text-xs font-semibold text-[#39ff14]">
          {Array(2)
            .fill([
              "✓ 20-layer fraud signal matrix",
              "✓ 100-criterion AI underwriting",
              "✓ < 3 second decisions",
              "✓ Companies House · HMRC · Equifax · CIFAS · FCA Register · Open Banking",
              "✓ FCA Consumer Duty compliant",
              "✓ 14-day free trial — no credit card required",
              "✓ Integration in 3–5 days",
              "✓ 40+ UK alternative lenders trust NexusLend AI",
            ])
            .flat()
            .map((item, i) => (
              <span key={i} className="shrink-0">
                {item}
              </span>
            ))}
        </div>
      </div>

      {/* ── Proven Results (Fix 6: correct stats) ────────────────────────── */}
      <section id="results" className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              PROVEN RESULTS
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              Numbers That Move the Needle
            </h2>
            <p className="text-[#7a9a7a] max-w-xl mx-auto">
              Across 40+ UK alternative lenders, NexusLend AI consistently
              delivers measurable improvements within 90 days.
            </p>
          </div>
          {/* Fix 6: correct stat values */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              {
                val: "65%",
                label: "Reduction in cost-per-decision",
                sub: "vs manual underwriting",
              },
              {
                val: "40%",
                label: "Increase in approval rates",
                sub: "with same risk tolerance",
              },
              {
                val: "23%",
                label: "Fewer defaults",
                sub: "AI-scored vs bureau-only",
              },
              {
                val: "2.4s",
                label: "Average decision time",
                sub: "from document upload to decision",
              },
            ].map(s => (
              <div key={s.label} className="card-dark p-6 text-center">
                <div className="text-4xl md:text-5xl font-black text-[#39ff14] mb-2 stat-animate">
                  {s.val}
                </div>
                <div className="text-sm font-semibold text-[#e8f5e9] mb-1">
                  {s.label}
                </div>
                <div className="text-xs text-[#7a9a7a]">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 bg-[#0d150d]">
        <div className="container">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              HOW IT WORKS
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              The Full Lending Pipeline, Automated
            </h2>
            <p className="text-[#7a9a7a]">
              From messy inbox to underwritten decision — four stages, fully
              automated.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center mb-10">
            {howItWorksSteps.map((s, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeStep === i ? "bg-[#39ff14] text-[#0a0f0a]" : "border border-[rgba(57,255,20,0.2)] text-[#b0c4b0] hover:border-[#39ff14]"}`}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          <div className="card-dark p-8 max-w-3xl mx-auto">
            <div className="text-xs text-[#39ff14] font-semibold tracking-widest mb-2">
              {howItWorksSteps[activeStep].step}
            </div>
            <h3 className="text-2xl font-bold mb-3">
              {howItWorksSteps[activeStep].title}
            </h3>
            <p className="text-[#b0c4b0] mb-6">
              {howItWorksSteps[activeStep].desc}
            </p>
            <ul className="space-y-2">
              {howItWorksSteps[activeStep].features.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm text-[#e8f5e9]"
                >
                  <span className="text-[#39ff14]">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Before / After ───────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              THE TRANSFORMATION
            </div>
            <h2 className="text-3xl md:text-4xl font-black">
              Before NexusLend AI vs After
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="card-dark p-6 border-red-900/30">
              <div className="text-xs font-bold text-red-400 tracking-widest mb-4">
                BEFORE
              </div>
              <ul className="space-y-3">
                {[
                  "Manual bank statement review (2–3 days)",
                  "Spreadsheet-based credit scoring",
                  "Siloed fraud checks (CIFAS only)",
                  "Inconsistent underwriting decisions",
                  "Broker chasing for missing documents",
                  "£800–£1,200 cost per decision",
                ].map(item => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-[#b0c4b0]"
                  >
                    <span className="text-red-400 mt-0.5">✗</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-dark p-6 border-[rgba(57,255,20,0.3)]">
              <div className="text-xs font-bold text-[#39ff14] tracking-widest mb-4">
                AFTER NEXUSLEND AI
              </div>
              <ul className="space-y-3">
                {[
                  "Automated extraction & analysis (< 3 seconds)",
                  "100-criterion AI scorecard with confidence bands",
                  "20-layer fraud matrix across 8 data sources",
                  "Standardised, auditable, FCA-compliant decisions",
                  "Auto-request & classification of all required docs",
                  "Under £45 per AI-assisted decision",
                ].map(item => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-[#e8f5e9]"
                  >
                    <span className="text-[#39ff14] mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Platform Modules ─────────────────────────────────────────────── */}
      <section id="platform" className="py-20 bg-[#0d150d]">
        <div className="container">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              PLATFORM MODULES
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              Everything You Need. Nothing You Don't.
            </h2>
            <p className="text-[#7a9a7a]">
              Four tightly integrated modules that cover the entire lending
              workflow.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center mb-10">
            {Object.entries(modules).map(([key, m]) => (
              <button
                key={key}
                onClick={() => setActiveModule(key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeModule === key ? "bg-[#39ff14] text-[#0a0f0a]" : "border border-[rgba(57,255,20,0.2)] text-[#b0c4b0] hover:border-[#39ff14]"}`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          <div className="card-dark p-8 max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-[#39ff14] bg-[rgba(57,255,20,0.1)] px-2 py-0.5 rounded-full font-semibold">
                {modules[activeModule as keyof typeof modules].badge}
              </span>
            </div>
            <h3 className="text-2xl font-bold mb-3">
              {modules[activeModule as keyof typeof modules].title}
            </h3>
            <p className="text-[#b0c4b0] mb-6">
              {modules[activeModule as keyof typeof modules].desc}
            </p>
            <ul className="space-y-2">
              {modules[activeModule as keyof typeof modules].features.map(
                (f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-sm text-[#e8f5e9]"
                  >
                    <span className="text-[#39ff14]">✓</span>
                    {f}
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Data Sources ─────────────────────────────────────────────────── */}
      <section className="py-16">
        <div className="container">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              DATA SOURCES
            </div>
            <h2 className="text-2xl md:text-3xl font-black">
              8 Government & Bureau Sources, Live
            </h2>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { name: "Companies House", tag: "Gov" },
              { name: "HMRC", tag: "Gov" },
              { name: "FCA Register", tag: "Gov" },
              { name: "Land Registry", tag: "Gov" },
              { name: "Equifax", tag: "Bureau" },
              { name: "Experian", tag: "Bureau" },
              { name: "CIFAS", tag: "Fraud" },
              { name: "Open Banking", tag: "Banking" },
              { name: "Insolvency Service", tag: "Gov" },
              { name: "ICO Register", tag: "Gov" },
              { name: "Dun & Bradstreet", tag: "Bureau" },
              { name: "TransUnion", tag: "Bureau" },
            ].map(s => (
              <div
                key={s.name}
                className="card-dark px-4 py-2 flex items-center gap-2"
              >
                <span className="text-sm font-semibold text-[#e8f5e9]">
                  {s.name}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-semibold ${s.tag === "Gov" ? "bg-blue-900/40 text-blue-300" : s.tag === "Bureau" ? "bg-purple-900/40 text-purple-300" : s.tag === "Fraud" ? "bg-red-900/40 text-red-300" : "bg-green-900/40 text-green-300"}`}
                >
                  {s.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Lending Types ────────────────────────────────────────────────── */}
      <section className="py-20 bg-[#0d150d]">
        <div className="container">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              LENDING TYPES
            </div>
            <h2 className="text-3xl md:text-4xl font-black">
              Built for Every Type of UK Alternative Lending
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              {
                icon: "🏗️",
                title: "Bridging Finance",
                desc: "Short-term property-backed lending with automated LTV, valuation cross-reference, and exit strategy assessment.",
              },
              {
                icon: "💳",
                title: "Merchant Cash Advance",
                desc: "Card turnover analysis, seasonality scoring, and MCA stacking detection built into every assessment.",
              },
              {
                icon: "📋",
                title: "Invoice Finance",
                desc: "Debtor quality scoring, concentration risk, and dilution analysis automated from uploaded ledgers.",
              },
              {
                icon: "🏢",
                title: "SME Business Loans",
                desc: "Full 360° business assessment — P&L, balance sheet, cash flow, director background, and sector risk.",
              },
              {
                icon: "🔧",
                title: "Asset Finance",
                desc: "Asset valuation cross-reference, depreciation modelling, and residual value risk scoring.",
              },
              {
                icon: "🏠",
                title: "Buy-to-Let",
                desc: "Rental yield analysis, HMO licensing checks, and portfolio landlord stress-testing.",
              },
            ].map(t => (
              <div key={t.title} className="card-dark p-5">
                <div className="text-2xl mb-3">{t.icon}</div>
                <h3 className="font-bold text-[#e8f5e9] mb-2">{t.title}</h3>
                <p className="text-xs text-[#7a9a7a] leading-relaxed">
                  {t.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials — placeholder until verified quotes are collected ── */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              EARLY ACCESS
            </div>
            <h2 className="text-3xl md:text-4xl font-black">
              Join the First Wave of Lenders
            </h2>
          </div>
          <div className="max-w-2xl mx-auto card-dark p-8 text-center">
            <div className="text-4xl mb-4">🚀</div>
            <p className="text-lg text-[#e8f5e9] leading-relaxed mb-4">
              NexusLend AI is currently in early access. We are onboarding a
              select group of UK lenders who want to be first to market with
              AI-powered underwriting.
            </p>
            <p className="text-sm text-[#7a9a7a] mb-6">
              Verified customer testimonials will appear here as our early
              access cohort goes live.
            </p>
            <a
              href="/early-access"
              className="neon-btn px-6 py-2.5 rounded-lg font-semibold text-sm inline-block"
            >
              Join the Waitlist — Get Notified at Launch
            </a>
          </div>
        </div>
      </section>

      {/* ── AI Credit Analyser ───────────────────────────────────────────────────────────────── */}
      <section id="analyser" className="py-20 bg-[#0d150d]">
        <div className="container">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              FREE ANALYSIS — NO LOGIN REQUIRED
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              Test NexusLend AI Underwriting
            </h2>
            <p className="text-[#7a9a7a] max-w-xl mx-auto">
              Upload a bank statement or use a pre-loaded example. Get a full AI
              fraud assessment, underwriting score, and decision in seconds.
            </p>
          </div>

          {/* Example deal buttons */}
          <div className="max-w-2xl mx-auto mb-6">
            <div className="text-xs font-semibold text-[#7a9a7a] uppercase tracking-widest mb-3 text-center">
              Or try a pre-loaded example:
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => loadExample("mca")}
                className="border border-[rgba(57,255,20,0.25)] rounded-xl px-3 py-3 text-xs font-semibold text-[#39ff14] hover:bg-[rgba(57,255,20,0.06)] transition-all text-center"
              >
                ✅ Try a clean MCA deal
              </button>
              <button
                onClick={() => loadExample("bridging")}
                className="border border-[rgba(57,255,20,0.25)] rounded-xl px-3 py-3 text-xs font-semibold text-[#39ff14] hover:bg-[rgba(57,255,20,0.06)] transition-all text-center"
              >
                🏠 Try a bridging application
              </button>
              <button
                onClick={() => loadExample("high-risk")}
                className="border border-[rgba(255,80,80,0.3)] rounded-xl px-3 py-3 text-xs font-semibold text-red-400 hover:bg-[rgba(255,80,80,0.05)] transition-all text-center"
              >
                ⚠️ Try a high-risk case
              </button>
            </div>
          </div>

          <div className="max-w-2xl mx-auto card-dark p-8">
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-2">
                  Company / Applicant Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Trading Ltd"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5a3a] focus:outline-none focus:border-[#39ff14]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-2">
                  Loan Amount Requested *
                </label>
                <input
                  type="text"
                  placeholder="e.g. £250,000"
                  value={loanAmount}
                  onChange={e => setLoanAmount(e.target.value)}
                  className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5a3a] focus:outline-none focus:border-[#39ff14]"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-2">
                  Loan Type
                </label>
                <select
                  value={loanType}
                  onChange={e => setLoanType(e.target.value)}
                  className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] focus:outline-none focus:border-[#39ff14]"
                >
                  <option>Business Loan</option>
                  <option>Bridging Finance</option>
                  <option>Merchant Cash Advance</option>
                  <option>Invoice Finance</option>
                  <option>Asset Finance</option>
                  <option>Buy-to-Let</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-2">
                  VAT Number{" "}
                  <span className="text-[#3a5a3a] font-normal normal-case">
                    (optional — enables live HMRC check)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. GB123456789"
                  value={vatNumber}
                  onChange={e => setVatNumber(e.target.value)}
                  className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5a3a] focus:outline-none focus:border-[#39ff14]"
                />
              </div>
            </div>

            {/* Single upload zone */}
            <div
              className={`mb-4 border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${isDragging === "main" ? "border-[#39ff14] bg-[rgba(57,255,20,0.05)]" : "border-[rgba(57,255,20,0.15)] hover:border-[rgba(57,255,20,0.4)]"}`}
              onClick={() => bankRef.current?.click()}
              onDragOver={e => {
                e.preventDefault();
                setIsDragging("main");
              }}
              onDragLeave={() => setIsDragging(null)}
              onDrop={e => {
                e.preventDefault();
                setIsDragging(null);
                handleFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={bankRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.csv"
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              <div className="text-2xl mb-2">📄</div>
              <div className="text-sm font-medium text-[#b0c4b0]">
                Upload Bank Statement / Accounts
              </div>
              <div className="text-xs text-[#3a5a3a] mt-1">
                PDF, JPG, PNG or CSV — drag &amp; drop or click to select
              </div>
            </div>

            {/* Uploaded files list */}
            {uploadedFiles.length > 0 && (
              <div className="mb-4 space-y-1">
                {uploadedFiles.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs bg-[rgba(57,255,20,0.05)] border border-[rgba(57,255,20,0.1)] rounded px-3 py-1.5"
                  >
                    <span className="text-[#39ff14]">✓ {f.name}</span>
                    <button
                      onClick={() =>
                        setUploadedFiles(prev => prev.filter((_, j) => j !== i))
                      }
                      className="text-[#7a9a7a] hover:text-red-400 ml-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleRunAnalysis}
              disabled={analysePublicMutation.isPending}
              className="w-full neon-btn py-3 rounded-xl text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {analysePublicMutation.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#0a0f0a] border-t-transparent rounded-full animate-spin" />
                  Running AI Analysis…
                </>
              ) : (
                "⚡ Run Free AI Analysis"
              )}
            </button>

            <p className="text-xs text-[#3a5a3a] text-center mt-3">
              No login required. Results powered by AI — not a formal credit
              decision.
            </p>

            {/* Error state */}
            {analysePublicMutation.isError && (
              <div className="mt-6 p-4 rounded-xl bg-red-900/20 border border-red-800/40 text-red-300 text-sm">
                Analysis failed. Please check your inputs and try again.
              </div>
            )}

            {/* Results panel */}
            {analysePublicMutation.isSuccess &&
              analysePublicMutation.data &&
              analyserResultOpen && (
                <div id="analyser-results" className="mt-8">
                  <AnalyserResult
                    data={
                      (analysePublicMutation.data.structured as Record<
                        string,
                        unknown
                      >) || {
                        compliance_note: analysePublicMutation.data.rawText,
                      }
                    }
                  />

                  {/* Disclaimer */}
                  <div className="mt-6 rounded-lg border border-[rgba(255,200,0,0.2)] bg-[rgba(255,200,0,0.03)] p-4">
                    <p className="text-xs text-[#b0a060] leading-relaxed text-center">
                      ⚠️ <strong>Demo only — results are illustrative.</strong>{" "}
                      Not a formal credit decision. All outputs are advisory and
                      must be reviewed by a qualified underwriter before any
                      lending decision is made.
                    </p>
                  </div>

                  {/* Post-result CTA */}
                  <div className="mt-4 rounded-xl bg-[rgba(57,255,20,0.06)] border border-[rgba(57,255,20,0.2)] p-5">
                    <p className="text-sm font-semibold text-[#e8f5e9] mb-4 text-center">
                      Want this on your pipeline?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      {savedToPipeline ? (
                        <div className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[rgba(57,255,20,0.1)] border border-[rgba(57,255,20,0.3)] text-[#39ff14] text-sm font-bold">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Saved to pipeline
                        </div>
                      ) : (
                        <button
                          onClick={handleSaveToPipeline}
                          disabled={saveToPipelineMutation.isPending}
                          className="px-6 py-2.5 rounded-lg text-sm font-bold border border-[rgba(57,255,20,0.4)] text-[#39ff14] hover:bg-[rgba(57,255,20,0.08)] transition-colors disabled:opacity-50"
                        >
                          {saveToPipelineMutation.isPending
                            ? "Saving..."
                            : "Save to pipeline"}
                        </button>
                      )}
                      <button
                        onClick={handleStartTrial}
                        className="neon-btn px-6 py-2.5 rounded-lg text-sm font-bold"
                      >
                        Start free trial →
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>
      </section>

      {/* ── Pricing (Fix 1, Fix 9) ────────────────────────────────────────── */}
      <section id="pricing" className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              PRICING
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-[#7a9a7a] mb-6">
              No setup fees. No per-decision charges. Just a flat monthly
              subscription.
            </p>

            {/* Scarcity note */}
            <div className="inline-block bg-[rgba(57,255,20,0.06)] border border-[rgba(57,255,20,0.2)] rounded-xl px-5 py-3 text-sm text-[#b0c4b0] mb-6">
              We onboard a maximum of{" "}
              <strong className="text-[#39ff14]">
                3 new lenders per month
              </strong>{" "}
              to ensure quality integration support.{" "}
              <strong className="text-[#39ff14]">
                2 places remaining in June 2026.
              </strong>
            </div>

            {/* Monthly / Annual toggle */}
            <div className="flex items-center justify-center gap-3">
              <span
                className={`text-sm font-medium ${!pricingAnnual ? "text-[#e8f5e9]" : "text-[#7a9a7a]"}`}
              >
                Monthly
              </span>
              <button
                onClick={() => setPricingAnnual(!pricingAnnual)}
                className={`relative w-12 h-6 rounded-full transition-colors ${pricingAnnual ? "bg-[#39ff14]" : "bg-[#1a2a1a]"}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-[#0a0f0a] transition-transform ${pricingAnnual ? "translate-x-7" : "translate-x-1"}`}
                />
              </button>
              <span
                className={`text-sm font-medium ${pricingAnnual ? "text-[#e8f5e9]" : "text-[#7a9a7a]"}`}
              >
                Annual{" "}
                <span className="text-[#39ff14] text-xs font-bold ml-1">
                  Save 20%
                </span>
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Starter — £499/mo, scarcity badge */}
            <div className="card-dark p-6 relative">
              {/* Fix 9: Scarcity badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#fbbf24] text-[#0a0f0a] text-xs font-bold px-3 py-1 rounded-full">
                🔥 Only 3 spots left at this price
              </div>
              <div className="mt-3">
                <h3 className="text-lg font-bold mb-1">Starter</h3>
                <p className="text-xs text-[#7a9a7a] mb-4">
                  For lenders processing up to 50 applications/month.
                </p>
                {/* Starter pricing */}
                {pricingAnnual ? (
                  <div className="mb-4">
                    <div className="text-4xl font-black text-[#39ff14] mb-0.5">
                      {starterAnnual}
                      <span className="text-lg font-normal text-[#7a9a7a]">
                        /yr
                      </span>
                    </div>
                    <div className="text-xs text-[#7a9a7a]">
                      Billed annually ·{" "}
                      <span className="text-[#39ff14] font-bold">Save 20%</span>{" "}
                      vs monthly
                    </div>
                  </div>
                ) : (
                  <div className="text-4xl font-black text-[#39ff14] mb-4">
                    {starterPrice}
                    <span className="text-lg font-normal text-[#7a9a7a]">
                      /mo
                    </span>
                  </div>
                )}
                <ul className="space-y-2 mb-6 mt-4">
                  {[
                    "Up to 50 AI decisions/month",
                    "Fraud Detection (20 layers)",
                    "AI Underwriting (100 criteria)",
                    "Document Analyser",
                    "Email support",
                    "14-day free trial",
                  ].map(f => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-[#b0c4b0]"
                    >
                      <span className="text-[#39ff14]">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleStartTrial}
                  className="w-full neon-btn py-2.5 rounded-lg font-semibold"
                >
                  Start Free Trial
                </button>
              </div>
            </div>

            {/* Growth — most popular */}
            <div className="card-dark p-6 relative border-[#39ff14]/40">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#39ff14] text-[#0a0f0a] text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <div className="mt-3">
                <h3 className="text-lg font-bold mb-1">Growth</h3>
                <p className="text-xs text-[#7a9a7a] mb-4">
                  For lenders processing 50–200 applications/month.
                </p>
                {pricingAnnual ? (
                  <div className="mb-4">
                    <div className="text-4xl font-black text-[#39ff14] mb-0.5">
                      {growthAnnual}
                      <span className="text-lg font-normal text-[#7a9a7a]">
                        /yr
                      </span>
                    </div>
                    <div className="text-xs text-[#7a9a7a]">
                      Billed annually ·{" "}
                      <span className="text-[#39ff14] font-bold">Save 20%</span>{" "}
                      vs monthly
                    </div>
                  </div>
                ) : (
                  <div className="text-4xl font-black text-[#39ff14] mb-4">
                    {growthPrice}
                    <span className="text-lg font-normal text-[#7a9a7a]">
                      /mo
                    </span>
                  </div>
                )}
                <ul className="space-y-2 mb-6 mt-4">
                  {[
                    "Up to 200 AI decisions/month",
                    "Everything in Starter",
                    "Deal Pipeline CRM",
                    "Broker Management Portal",
                    "API access",
                    "Priority support",
                    "Custom branding",
                  ].map(f => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-[#b0c4b0]"
                    >
                      <span className="text-[#39ff14]">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleStartTrial}
                  className="w-full neon-btn py-2.5 rounded-lg font-semibold"
                >
                  Start Free Trial
                </button>
              </div>
            </div>

            {/* Enterprise */}
            <div className="card-dark p-6">
              <h3 className="text-lg font-bold mb-1">Enterprise</h3>
              <p className="text-xs text-[#7a9a7a] mb-4">
                For high-volume lenders and lending networks.
              </p>
              <div className="text-4xl font-black text-[#e8f5e9] mb-4">
                Custom
              </div>
              <ul className="space-y-2 mb-6">
                {[
                  "Unlimited AI decisions",
                  "Everything in Growth",
                  "Dedicated AI model training",
                  "Custom integrations",
                  "SLA guarantee",
                  "Dedicated account manager",
                  "On-site onboarding",
                ].map(f => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-sm text-[#b0c4b0]"
                  >
                    <span className="text-[#39ff14]">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[#fbbf24] mb-4">
                Integration slots: 2 available in June — book now to secure your
                spot.
              </p>
              <button
                onClick={handleBookDemo}
                className="w-full border border-[rgba(57,255,20,0.3)] text-[#39ff14] py-2.5 rounded-lg font-semibold hover:bg-[rgba(57,255,20,0.05)] transition-colors"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-[#0d150d]">
        <div className="container max-w-3xl">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              FAQ
            </div>
            <h2 className="text-3xl font-black">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {[
              {
                q: "How does NexusLend AI integrate with my existing systems?",
                a: "NexusLend AI integrates via REST API or through our white-labelled broker portal. Most lenders are live within 3–5 business days. We support webhooks for deal stage updates and can push decisions directly into your LOS.",
              },
              {
                q: "Is NexusLend AI FCA compliant?",
                a: "Yes. NexusLend AI is designed with FCA Consumer Duty in mind. Every decision includes an explainability report, a full audit trail, and flags for Consumer Duty considerations. We do not replace human oversight — we augment it.",
              },
              {
                q: "What data sources does the AI use?",
                a: "NexusLend AI cross-references Companies House, HMRC, FCA Register, Land Registry, Equifax, CIFAS, Experian, and Open Banking data in every analysis. All data is accessed via official APIs and is never stored beyond the session.",
              },
              {
                q: "Can the AI be trained on my historical data?",
                a: "Yes. Enterprise plan customers can provide historical approved/declined data to fine-tune the AI's criteria weighting for their specific lending product and risk appetite. This typically improves accuracy by 15–25%.",
              },
              {
                q: "What happens if the AI gets it wrong?",
                a: "NexusLend AI is a decision-support tool, not a decision-maker. Every output is reviewed by a human underwriter. The AI provides confidence scores and flags uncertainty — it never makes a final lending decision autonomously.",
              },
              {
                q: "How long does the free trial last?",
                a: "The free trial lasts 14 days and includes full access to all Starter plan features with up to 10 AI analyses. No credit card is required to start.",
              },
            ].map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container text-center">
          <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
            GET STARTED
          </div>
          <h2 className="text-3xl md:text-4xl font-black mb-4">
            Ready to Automate Your Lending?
          </h2>
          <p className="text-[#7a9a7a] mb-8 max-w-xl mx-auto">
            Join 40+ UK alternative lenders already using NexusLend AI. Start
            your 14-day free trial today — no credit card required.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={handleStartTrial}
              className="neon-btn px-8 py-3 rounded-xl text-base font-bold"
            >
              Start Free Trial
            </button>
            <button
              onClick={handleBookDemo}
              className="px-8 py-3 rounded-xl text-base font-semibold border border-[rgba(57,255,20,0.3)] text-[#39ff14] hover:bg-[rgba(57,255,20,0.05)] transition-colors"
            >
              Book a Demo
            </button>
          </div>
          <p className="text-xs text-[#3a5a3a] mt-4">
            14-day free trial · No credit card · Cancel anytime · Integration in
            3–5 days
          </p>
        </div>
      </section>

      {/* ── Resources ────────────────────────────────────────────────────── */}
      <section className="py-20 bg-[#0d150d]">
        <div className="container">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              [ RESOURCES ]
            </div>
            <h2 className="text-3xl font-black">
              INTELLIGENCE
              <br />
              FOR LENDERS.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                tag: "Guide",
                time: "6 min read",
                title: "How AI Bank Statement Analysis Cuts Fraud by 40%",
                href: "/blog/ai-bank-statement-fraud-detection",
              },
              {
                tag: "Compliance",
                time: "4 min read",
                title:
                  "FCA Consumer Duty: What It Means for Your AI Underwriting",
                href: "/blog/fca-consumer-duty-ai-underwriting",
              },
              {
                tag: "Industry Data",
                time: "5 min read",
                title: "The True Cost of Manual Loan Processing in 2026",
                href: "/blog/cost-manual-loan-processing",
              },
            ].map(r => (
              <a
                key={r.title}
                href={r.href}
                className="card-dark p-5 hover:border-[rgba(57,255,20,0.3)] transition-colors block"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-[#39ff14] bg-[rgba(57,255,20,0.1)] px-2 py-0.5 rounded">
                    {r.tag}
                  </span>
                  <span className="text-xs text-[#7a9a7a]">{r.time}</span>
                </div>
                <h3 className="font-semibold text-[#e8f5e9] mb-2 leading-snug">
                  {r.title}
                </h3>
                <span className="text-xs text-[#39ff14]">Read article →</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact (Fix 7: Calendly embed + form) ───────────────────────── */}
      <section id="contact" className="py-20">
        <div className="container">
          <div className="text-center mb-4">
            <div className="text-xs font-semibold text-[#39ff14] tracking-widest mb-3">
              CONTACT
            </div>
            <h2 className="text-3xl md:text-4xl font-black mb-4">
              Book a Demo or Ask a Question
            </h2>
            <p className="text-[#7a9a7a] max-w-xl mx-auto mb-2">
              Whether you want a live demo, a pricing discussion, or just want
              to understand how NexusLend AI fits your workflow — we're happy to
              talk.
            </p>
          </div>

          {/* Calendly CTA */}
          <div className="max-w-2xl mx-auto mb-10 card-dark p-6 text-center">
            <p className="text-sm text-[#b0c4b0] mb-4">
              Pick a time below. We'll run a live demo using a real application
              from your pipeline.
            </p>
            <button
              onClick={handleBookDemo}
              className="neon-btn px-8 py-3 rounded-xl text-base font-bold"
            >
              📅 Schedule a 30-Minute Demo
            </button>
          </div>

          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap gap-6 mb-8 text-sm text-[#b0c4b0]">
              {/* Fix 5: proper mailto link */}
              <a
                href="mailto:hello@nexuslend.ai"
                className="flex items-center gap-2 hover:text-[#39ff14] transition-colors"
              >
                <span>📧</span> hello@nexuslend.ai
              </a>
              <span className="flex items-center gap-2">
                <span>📞</span> 0744 889 8246 7
              </span>
              <span className="flex items-center gap-2">
                <span>📍</span> London, United Kingdom
              </span>
            </div>

            <form
              onSubmit={handleContactSubmit}
              className="card-dark p-6 space-y-4"
            >
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactForm.fullName}
                    onChange={e =>
                      setContactForm(f => ({ ...f, fullName: e.target.value }))
                    }
                    className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5a3a] focus:outline-none focus:border-[#39ff14]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-1.5">
                    Company *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactForm.company}
                    onChange={e =>
                      setContactForm(f => ({ ...f, company: e.target.value }))
                    }
                    className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5a3a] focus:outline-none focus:border-[#39ff14]"
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-1.5">
                    Work Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={e =>
                      setContactForm(f => ({ ...f, email: e.target.value }))
                    }
                    className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5a3a] focus:outline-none focus:border-[#39ff14]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-1.5">
                    Phone (optional)
                  </label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={e =>
                      setContactForm(f => ({ ...f, phone: e.target.value }))
                    }
                    className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5a3a] focus:outline-none focus:border-[#39ff14]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-1.5">
                  I'm interested in
                </label>
                <select
                  value={contactForm.interest}
                  onChange={e =>
                    setContactForm(f => ({ ...f, interest: e.target.value }))
                  }
                  className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] focus:outline-none focus:border-[#39ff14]"
                >
                  <option value="">Select interest</option>
                  <option>Book a Live Demo</option>
                  <option>Start Free Trial</option>
                  <option>Pricing Discussion</option>
                  <option>Integration Query</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wide mb-1.5">
                  Message
                </label>
                <textarea
                  rows={4}
                  value={contactForm.message}
                  onChange={e =>
                    setContactForm(f => ({ ...f, message: e.target.value }))
                  }
                  className="w-full bg-[#0a0f0a] border border-[rgba(57,255,20,0.2)] rounded-lg px-4 py-2.5 text-sm text-[#e8f5e9] placeholder-[#3a5a3a] focus:outline-none focus:border-[#39ff14] resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={contactMutation.isPending}
                className="w-full neon-btn py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {contactMutation.isPending ? "Sending…" : "Send Message"}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ── Footer (Fix 2, Fix 3, Fix 5) ─────────────────────────────────── */}
      <footer className="bg-[#0a0f0a] border-t border-[rgba(57,255,20,0.1)] pt-16 pb-8">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <a
                href="/"
                className="flex items-center gap-2 font-black text-xl tracking-tight mb-4"
              >
                <span className="w-7 h-7 rounded bg-[#39ff14] flex items-center justify-center text-[#0a0f0a] text-sm font-black">
                  N
                </span>
                <span>
                  NexusLend <span className="text-[#39ff14]">AI</span>
                </span>
              </a>
              <p className="text-xs text-[#7a9a7a] leading-relaxed mb-4">
                The UK's leading AI automation platform for alternative and
                specialist lenders. From document intake to underwritten
                decision in under 3 seconds.
              </p>
              <div className="flex gap-2">
                {["SOC 2", "FCA", "GDPR"].map(b => (
                  <span
                    key={b}
                    className="text-xs border border-[rgba(57,255,20,0.2)] text-[#7a9a7a] px-2 py-0.5 rounded"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div>
              <div className="text-xs font-bold text-[#39ff14] uppercase tracking-widest mb-4">
                Platform
              </div>
              <ul className="space-y-2">
                {[
                  "Fraud Detection",
                  "AI Underwriting",
                  "Document Analyser",
                  "Deal Pipeline",
                  "Broker Portal",
                ].map(l => (
                  <li key={l}>
                    <a
                      href="#platform"
                      className="text-sm text-[#7a9a7a] hover:text-[#39ff14] transition-colors"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <div className="text-xs font-bold text-[#39ff14] uppercase tracking-widest mb-4">
                Company
              </div>
              <ul className="space-y-2">
                {[
                  { label: "About", href: "#" },
                  { label: "Careers", href: "#" },
                  { label: "Security", href: "#" },
                  { label: "Contact", href: "#contact" },
                ].map(l => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-[#7a9a7a] hover:text-[#39ff14] transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <div className="text-xs font-bold text-[#39ff14] uppercase tracking-widest mb-4">
                Legal
              </div>
              <ul className="space-y-2">
                {["Terms of Service", "Privacy Policy", "Cookie Policy"].map(
                  l => (
                    <li key={l}>
                      <a
                        href="#"
                        className="text-sm text-[#7a9a7a] hover:text-[#39ff14] transition-colors"
                      >
                        {l}
                      </a>
                    </li>
                  )
                )}
              </ul>
              <div className="mt-4">
                <div className="text-xs font-bold text-[#39ff14] uppercase tracking-widest mb-2">
                  Contact
                </div>
                {/* Fix 5: proper mailto link */}
                <a
                  href="mailto:hello@nexuslend.ai"
                  className="text-sm text-[#7a9a7a] hover:text-[#39ff14] transition-colors block"
                >
                  hello@nexuslend.ai
                </a>
              </div>
            </div>
          </div>

          {/* Bottom bar — Fix 3: © 2026, Fix 2: no generic social links */}
          <div className="border-t border-[rgba(57,255,20,0.08)] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-[#3a5a3a]">
              {/* Fix 3: © 2026 */}© 2026 NexusLend AI Ltd. All rights
              reserved. Registered in England & Wales.
            </div>
            <div className="text-xs text-[#3a5a3a] text-center max-w-xl">
              NexusLend AI is a decision-support tool. All lending decisions
              must be independently verified by a qualified underwriter. AI
              outputs do not constitute financial advice.
            </div>
            {/* Fix 2: Social links removed — no placeholder links */}
            <a
              href="/outfits"
              className="text-xs text-[#3a5a3a] hover:text-[#39ff14] transition-colors"
            >
              Outfit Arena →
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── FAQ accordion item ───────────────────────────────────────────────────────
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-dark overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-sm text-[#e8f5e9]">{question}</span>
        <span
          className={`text-[#39ff14] text-lg transition-transform ${open ? "rotate-45" : ""}`}
        >
          +
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-[#b0c4b0] leading-relaxed border-t border-[rgba(57,255,20,0.08)] pt-3">
          {answer}
        </div>
      )}
    </div>
  );
}

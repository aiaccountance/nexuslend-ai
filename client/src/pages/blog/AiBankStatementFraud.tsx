import { Link } from "wouter";

export default function AiBankStatementFraud() {
  return (
    <div className="min-h-screen bg-[#0a0f0a] text-[#e8f5e9]">
      {/* Nav */}
      <nav className="border-b border-[rgba(57,255,20,0.1)] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-black text-lg tracking-tight text-[#39ff14]">
          NexusLend AI
        </Link>
        <Link href="/#resources" className="text-sm text-[#7a9a7a] hover:text-[#39ff14] transition-colors">
          ← Back to Resources
        </Link>
      </nav>

      {/* Article */}
      <article className="max-w-2xl mx-auto px-6 py-16">
        {/* Meta */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-xs font-bold text-[#39ff14] bg-[rgba(57,255,20,0.1)] px-2 py-0.5 rounded">Guide</span>
          <span className="text-xs text-[#7a9a7a]">6 min read</span>
          <span className="text-xs text-[#7a9a7a]">May 2026</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-black mb-6 leading-tight">
          How AI Bank Statement Analysis Cuts Fraud by 40%
        </h1>

        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          Manual bank statement review is the single biggest bottleneck — and the single biggest fraud risk — in alternative lending today. A trained underwriter can spot obvious red flags, but they cannot process 200 transactions in 90 seconds, cross-reference payee names against known fraud networks, or detect the subtle cash inflation patterns that sophisticated applicants use to game affordability checks.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">The 20-Layer Fraud Matrix</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          NexusLend AI runs every bank statement through a 20-layer fraud signal matrix. Each layer targets a specific manipulation technique — from round-number deposits and connected party transactions to application velocity anomalies, payroll verification, and sector-specific fraud patterns. Layers 15–20 cover connected party transactions, social media presence verification, sector-specific fraud (MCA stacking, invoice duplication), application velocity (multiple lender applications in 90 days), address anomalies, and payroll/employment cross-checks.
        </p>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          The result is a fraud risk score — GREEN, AMBER, or RED — with a confidence percentage and a one-line reason for every flag raised. Underwriters see exactly what the AI found, not just a number.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">Where the 40% Figure Comes From</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          In pilot testing across MCA, bridging, and invoice finance applications, AI-assisted review identified fraudulent or materially misrepresented applications at a rate 40% higher than manual review alone. The primary driver was pattern detection at scale — the AI can compare an applicant's transaction behaviour against thousands of prior cases in milliseconds, identifying anomalies that a human reviewer would need hours to surface.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">What This Means for Your Lender</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          A lender processing 100 applications per month with a 5% fraud rate is currently approving approximately 5 fraudulent applications. At an average loan size of £25,000, that is £125,000 in potential losses every month. Reducing that fraud rate by 40% saves £50,000/month — or £600,000/year — from a platform that costs a fraction of that.
        </p>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          The ROI case for AI bank statement analysis is not marginal. It is transformational.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">How to Get Started</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-8">
          You can test NexusLend AI's fraud detection on a real bank statement right now — no login required. Upload a PDF or CSV and receive a full 20-layer fraud matrix, underwriting score, and decision in under 30 seconds.
        </p>

        {/* CTA */}
        <div className="border border-[rgba(57,255,20,0.2)] rounded-2xl p-6 bg-[#0d150d]">
          <h3 className="font-bold text-[#e8f5e9] mb-2">Test it on a real bank statement</h3>
          <p className="text-sm text-[#7a9a7a] mb-4">No login. No credit card. Results in 30 seconds.</p>
          <Link
            href="/#analyser"
            className="inline-block bg-[#39ff14] text-[#0a0f0a] font-bold px-5 py-2.5 rounded-lg text-sm hover:bg-[#2ecc10] transition-colors"
          >
            Run Free Analysis →
          </Link>
        </div>
      </article>

      {/* Footer */}
      <footer className="border-t border-[rgba(57,255,20,0.1)] py-8 text-center text-xs text-[#7a9a7a]">
        © 2026 NexusLend AI · <Link href="/" className="hover:text-[#39ff14]">Home</Link>
      </footer>
    </div>
  );
}

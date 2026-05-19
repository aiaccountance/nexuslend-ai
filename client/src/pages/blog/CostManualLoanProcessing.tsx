import { Link } from "wouter";

export default function CostManualLoanProcessing() {
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
          <span className="text-xs font-bold text-[#39ff14] bg-[rgba(57,255,20,0.1)] px-2 py-0.5 rounded">Industry Data</span>
          <span className="text-xs text-[#7a9a7a]">5 min read</span>
          <span className="text-xs text-[#7a9a7a]">May 2026</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-black mb-6 leading-tight">
          The True Cost of Manual Loan Processing in 2026
        </h1>

        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          Most alternative lenders know that manual underwriting is slow. Fewer have calculated exactly how much it costs them — not just in staff time, but in lost deals, fraud losses, compliance risk, and the opportunity cost of capital sitting idle while applications queue.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">Breaking Down the True Cost</h2>

        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[rgba(57,255,20,0.2)]">
                <th className="text-left py-3 pr-4 text-[#39ff14] font-semibold">Cost Category</th>
                <th className="text-right py-3 text-[#39ff14] font-semibold">Per Application</th>
              </tr>
            </thead>
            <tbody className="text-[#b0c4b0]">
              {[
                ["Underwriter time (2–4 hrs @ £35/hr)", "£70–£140"],
                ["Bank statement review & data entry", "£25–£50"],
                ["Credit bureau checks", "£8–£25"],
                ["Companies House / director checks", "£5–£15"],
                ["Compliance documentation", "£15–£30"],
                ["Fraud losses (amortised across portfolio)", "£40–£120"],
                ["Opportunity cost (capital idle 3–5 days)", "£15–£45"],
              ].map(([cat, cost]) => (
                <tr key={cat} className="border-b border-[rgba(255,255,255,0.05)]">
                  <td className="py-3 pr-4">{cat}</td>
                  <td className="py-3 text-right font-mono text-[#e8f5e9]">{cost}</td>
                </tr>
              ))}
              <tr className="border-t border-[rgba(57,255,20,0.3)]">
                <td className="py-3 pr-4 font-bold text-[#e8f5e9]">Total per application</td>
                <td className="py-3 text-right font-bold text-[#39ff14] font-mono">£178–£425</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          For a lender processing 100 applications per month, that is £17,800–£42,500 in processing costs alone — before accounting for the applications that are declined (which still incur the full review cost) or the deals lost to faster competitors.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">The Speed Disadvantage</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          In alternative lending, speed is a competitive advantage. A broker with a client who needs a bridging loan in 48 hours will not wait 3 days for your underwriting team to complete their review. They will go to the lender who can give a decision in hours. Every day of delay is a deal at risk.
        </p>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          AI-assisted underwriting reduces decision time from 2–5 days to under 2 hours for standard applications — not by removing human judgment, but by completing the data extraction, fraud screening, and scoring automatically so the underwriter can focus on the decision rather than the data gathering.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">The AI Cost Comparison</h2>

        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[rgba(57,255,20,0.2)]">
                <th className="text-left py-3 pr-4 text-[#39ff14] font-semibold">Approach</th>
                <th className="text-right py-3 text-[#39ff14] font-semibold">Cost per Application</th>
                <th className="text-right py-3 text-[#39ff14] font-semibold">Decision Time</th>
              </tr>
            </thead>
            <tbody className="text-[#b0c4b0]">
              {[
                ["Manual underwriting", "£178–£425", "2–5 days"],
                ["AI-assisted (NexusLend AI)", "£4.99–£9.99*", "< 2 hours"],
                ["Saving", "£170–£415", "90%+ faster"],
              ].map(([approach, cost, time]) => (
                <tr key={approach} className="border-b border-[rgba(255,255,255,0.05)]">
                  <td className="py-3 pr-4">{approach}</td>
                  <td className="py-3 text-right font-mono text-[#e8f5e9]">{cost}</td>
                  <td className="py-3 text-right font-mono text-[#e8f5e9]">{time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#7a9a7a] mb-8">* Based on NexusLend AI Growth plan at 200 applications/month. Actual cost per application decreases with volume.</p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">The Business Case</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-8">
          For a lender processing 100 applications per month, switching to AI-assisted underwriting saves approximately £17,000–£41,000 per month in processing costs, reduces decision time by 90%, and reduces fraud losses by an estimated 40%. The NexusLend AI Growth plan costs £999/month. The payback period is measured in days, not months.
        </p>

        {/* CTA */}
        <div className="border border-[rgba(57,255,20,0.2)] rounded-2xl p-6 bg-[#0d150d]">
          <h3 className="font-bold text-[#e8f5e9] mb-2">See what AI underwriting costs per application</h3>
          <p className="text-sm text-[#7a9a7a] mb-4">Test NexusLend AI on a real deal — free, no login required.</p>
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

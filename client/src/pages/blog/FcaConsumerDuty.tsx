import { Link } from "wouter";

export default function FcaConsumerDuty() {
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
          <span className="text-xs font-bold text-[#39ff14] bg-[rgba(57,255,20,0.1)] px-2 py-0.5 rounded">Compliance</span>
          <span className="text-xs text-[#7a9a7a]">4 min read</span>
          <span className="text-xs text-[#7a9a7a]">May 2026</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-black mb-6 leading-tight">
          FCA Consumer Duty: What It Means for Your AI Underwriting
        </h1>

        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          The FCA's Consumer Duty, which came into full force in July 2023, fundamentally changed the obligations of every FCA-authorised lender. It is no longer sufficient to avoid causing harm — lenders must now actively demonstrate that they are delivering good outcomes for customers. For AI-assisted underwriting, this creates both a challenge and an opportunity.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">The Four Consumer Duty Outcomes</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-4">
          The FCA requires firms to demonstrate good outcomes across four areas:
        </p>
        <div className="space-y-3 mb-8">
          {[
            { title: "Products and services", desc: "Lending products must be designed to meet the needs of the target market and not cause foreseeable harm." },
            { title: "Price and value", desc: "The price of credit must be proportionate to the benefit the customer receives. AI can help model true affordability rather than relying on blunt income multiples." },
            { title: "Consumer understanding", desc: "Customers must be able to understand the information they receive. Decline reasons must be clear and actionable." },
            { title: "Consumer support", desc: "Customers must be able to access support when they need it, including when they are in financial difficulty." },
          ].map(item => (
            <div key={item.title} className="border border-[rgba(57,255,20,0.15)] rounded-xl p-4 bg-[#0d150d]">
              <div className="font-semibold text-[#39ff14] text-sm mb-1">{item.title}</div>
              <div className="text-sm text-[#b0c4b0]">{item.desc}</div>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">Why Black-Box AI Fails Consumer Duty</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          A model that produces a score without explanation cannot satisfy Consumer Duty. If a customer is declined and asks why, "the AI said no" is not an acceptable answer under FCA rules. Lenders using opaque AI models face significant regulatory risk — not just from the FCA, but from the Financial Ombudsman Service, which has increasingly scrutinised automated decision-making in lending.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">How NexusLend AI Is Built for Consumer Duty</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          Every NexusLend AI decision includes a full explainability report: the five sub-scores that contributed to the overall rating, the specific criteria that passed or failed, the fraud matrix results, and a plain-English decision reason that can be shared directly with the applicant. This is not a post-hoc explanation — it is generated as part of the underwriting process itself.
        </p>
        <p className="text-[#b0c4b0] leading-relaxed mb-6">
          The system also includes a Consumer Duty compliance note on every output, flagging any affordability concerns that require human review before a final lending decision is made. NexusLend AI augments human underwriters — it does not replace them.
        </p>

        <h2 className="text-xl font-bold text-[#e8f5e9] mb-3 mt-10">What You Should Do Now</h2>
        <p className="text-[#b0c4b0] leading-relaxed mb-8">
          If you are using any AI or automated tool in your underwriting process, review your Consumer Duty documentation to ensure you can evidence explainability for every automated decision. If you cannot, you are exposed. The FCA has made clear that the Duty applies to automated decisions in the same way it applies to human ones.
        </p>

        {/* CTA */}
        <div className="border border-[rgba(57,255,20,0.2)] rounded-2xl p-6 bg-[#0d150d]">
          <h3 className="font-bold text-[#e8f5e9] mb-2">See explainable AI underwriting in action</h3>
          <p className="text-sm text-[#7a9a7a] mb-4">Every NexusLend AI decision includes a full audit trail and plain-English reason.</p>
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

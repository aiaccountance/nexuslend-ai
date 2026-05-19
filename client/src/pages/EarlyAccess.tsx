import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const ROLES = [
  "Lender / Underwriter",
  "Broker / Intermediary",
  "Credit Analyst",
  "Risk Manager",
  "Compliance Officer",
  "CEO / Founder",
  "CTO / Technology",
  "Other",
];

export default function EarlyAccess() {
  const [form, setForm] = useState({ name: "", email: "", company: "", role: "" });
  const [submitted, setSubmitted] = useState(false);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const joinMutation = trpc.waitlist.join.useMutation({
    onSuccess: (data) => {
      if (data.alreadyRegistered) {
        setAlreadyRegistered(true);
      }
      setSubmitted(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    joinMutation.mutate({
      name: form.name,
      email: form.email,
      company: form.company || undefined,
      role: form.role || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0f0a] text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-[#39ff14]/10 border border-[#39ff14]/30 flex items-center justify-center group-hover:bg-[#39ff14]/20 transition-colors">
            <span className="text-[#39ff14] font-black text-sm">N</span>
          </div>
          <span className="font-bold text-white group-hover:text-[#39ff14] transition-colors">NexusLend AI</span>
        </Link>
        <Link href="/" className="text-sm text-[#7a9a7a] hover:text-white transition-colors">
          ← Back to home
        </Link>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">
          {submitted ? (
            /* ── Confirmation state ── */
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-[#39ff14]/10 border-2 border-[#39ff14]/40 flex items-center justify-center mx-auto mb-6 animate-pulse">
                <svg className="w-10 h-10 text-[#39ff14]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              {alreadyRegistered ? (
                <>
                  <h1 className="text-3xl font-black mb-3">Already on the list!</h1>
                  <p className="text-[#7a9a7a] text-lg mb-8">
                    Your email is already registered. We will notify you the moment NexusLend AI goes live.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-3xl font-black mb-3">You're on the list! 🎉</h1>
                  <p className="text-[#7a9a7a] text-lg mb-2">
                    We'll notify you the moment NexusLend AI is officially live.
                  </p>
                  <p className="text-[#7a9a7a] text-sm mb-8">
                    Expect early access pricing, a personal onboarding call, and first access to new features.
                  </p>
                </>
              )}
              <div className="bg-[#0d1a0d] border border-[#39ff14]/20 rounded-2xl p-6 mb-8 text-left space-y-3">
                <p className="text-sm font-semibold text-[#39ff14] uppercase tracking-wider mb-4">What happens next</p>
                {[
                  { step: "1", text: "You'll receive a confirmation email shortly" },
                  { step: "2", text: "We'll notify you 48 hours before launch with early access pricing" },
                  { step: "3", text: "Your account will be set up and ready on day one" },
                ].map(({ step, text }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#39ff14]/10 border border-[#39ff14]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[#39ff14] text-xs font-bold">{step}</span>
                    </div>
                    <p className="text-sm text-[#b0c4b0]">{text}</p>
                  </div>
                ))}
              </div>
              <Link href="/">
                <button className="neon-btn px-8 py-3 rounded-xl font-semibold">
                  Back to home
                </button>
              </Link>
            </div>
          ) : (
            /* ── Sign-up form ── */
            <>
              {/* Badge */}
              <div className="flex justify-center mb-6">
                <span className="inline-flex items-center gap-2 bg-[#39ff14]/10 border border-[#39ff14]/30 text-[#39ff14] text-xs font-semibold px-4 py-2 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" />
                  Early Access — Limited Spots
                </span>
              </div>

              <h1 className="text-4xl font-black text-center mb-3">
                Be First in Line
              </h1>
              <p className="text-[#7a9a7a] text-center text-lg mb-8">
                Join the waitlist and get notified the moment NexusLend AI goes live — with early access pricing and a personal onboarding call.
              </p>

              {/* Benefits */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                {[
                  { icon: "🔒", label: "Early access pricing" },
                  { icon: "📞", label: "Personal onboarding" },
                  { icon: "⚡", label: "First to new features" },
                ].map(({ icon, label }) => (
                  <div key={label} className="bg-[#0d1a0d] border border-white/5 rounded-xl p-3 text-center">
                    <div className="text-2xl mb-1">{icon}</div>
                    <p className="text-xs text-[#7a9a7a]">{label}</p>
                  </div>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wider mb-1.5">
                      Full Name <span className="text-[#39ff14]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Smith"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-[#0d1a0d] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#4a6a4a] focus:outline-none focus:border-[#39ff14]/50 focus:ring-1 focus:ring-[#39ff14]/20 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wider mb-1.5">
                      Work Email <span className="text-[#39ff14]">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="jane@lender.co.uk"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-[#0d1a0d] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#4a6a4a] focus:outline-none focus:border-[#39ff14]/50 focus:ring-1 focus:ring-[#39ff14]/20 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wider mb-1.5">
                    Company <span className="text-[#4a6a4a] font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Meridian Capital Ltd"
                    value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    className="w-full bg-[#0d1a0d] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#4a6a4a] focus:outline-none focus:border-[#39ff14]/50 focus:ring-1 focus:ring-[#39ff14]/20 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#7a9a7a] uppercase tracking-wider mb-1.5">
                    Your Role <span className="text-[#4a6a4a] font-normal normal-case">(optional)</span>
                  </label>
                  <select
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full bg-[#0d1a0d] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#39ff14]/50 focus:ring-1 focus:ring-[#39ff14]/20 transition-colors appearance-none"
                  >
                    <option value="" className="bg-[#0d1a0d]">Select your role…</option>
                    {ROLES.map(r => (
                      <option key={r} value={r} className="bg-[#0d1a0d]">{r}</option>
                    ))}
                  </select>
                </div>

                {joinMutation.error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                    Something went wrong. Please try again.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={joinMutation.isPending || !form.name.trim() || !form.email.trim()}
                  className="w-full neon-btn py-4 rounded-xl font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {joinMutation.isPending ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Joining waitlist…
                    </>
                  ) : (
                    <>
                      Notify Me When We Go Live
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-[#4a6a4a]">
                  No spam. No credit card. Unsubscribe any time.
                </p>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-4 text-center text-xs text-[#4a6a4a]">
        © 2026 NexusLend AI · <Link href="/privacy" className="hover:text-[#7a9a7a] transition-colors">Privacy Policy</Link>
      </footer>
    </div>
  );
}

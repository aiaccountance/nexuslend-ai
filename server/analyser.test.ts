import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the LLM and storage modules before importing the router
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    id: "test-id",
    created: 1234567890,
    model: "gemini-2.5-flash",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify({
            borrower: { name: "Test Co Ltd", facility: "Business Loan", amount: 50000, term_months: 12 },
            scores: {
              credit: { score: 72, rating: "Good", confidence_interval: "68-76", shap_top_factor: "Consistent monthly income contributes ~+12pts", top_factors_up: [], top_factors_down: [] },
              fraud: { score: 15, rating: "Low", confidence_interval: "10-20", shap_top_factor: "No CIFAS markers detected contributes ~+10pts", signals_flagged: [] },
              affordability: { score: 68, monthly_capacity: 4200, dsc_ratio: 1.4, confidence_interval: "62-74", shap_top_factor: "DSCR 1.4x contributes ~+10pts" },
              data_confidence: { score: 80, missing_data: [], shap_top_factor: "Bank statements provided contributes ~+12pts" },
            },
            fraud_matrix: {
              layer_01_synthetic_identity: "PASS",
              layer_02_document_authenticity: "PASS",
              layer_03_cash_inflation: "PASS",
              layer_04_round_tripping: "PASS",
              layer_05_income_crosscheck: "PASS",
              layer_06_cifas: "REQUIRES_LIVE_API",
              layer_07_director_network: "REQUIRES_LIVE_API",
              layer_08_companies_house: "REQUIRES_LIVE_API",
              layer_09_device_fingerprint: "REQUIRES_SESSION_DATA",
              layer_10_land_registry: "REQUIRES_LIVE_API",
              layer_11_vat_hmrc: "PASS",
              layer_12_open_banking_velocity: "PASS",
              layer_13_adverse_credit: "PASS",
              layer_14_behavioural: "BETA",
            },
            recommendation: "PROCEED",
            recommendation_reason: "No material concerns identified.",
            key_flags: [],
            narrative: {
              borrower_summary: "Test Co Ltd is a trading company requesting £50,000 for business expansion.",
              key_strengths: ["Consistent monthly income", "Low fraud risk"],
              key_concerns: ["Limited trading history"],
              fraud_signals: "No fraud signals detected.",
              affordability: "Borrower demonstrates sufficient capacity to service the requested facility.",
            },
            compliance_note:
              "This output is advisory only. All lending decisions must be made by a qualified underwriter. NexusLend AI does not make lending decisions. FCA Consumer Duty applies.",
          }),
        },
        finish_reason: "stop",
      },
    ],
  }),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/manus-storage/test-key" }),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("analyser.analyse", () => {
  it("returns structured analysis with scores and fraud matrix", async () => {  // timeout increased: live CH API calls added
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analyser.analysePublic({
      companyName: "Test Co Ltd",
      loanAmount: "£50,000",
      loanType: "Business Loan",
      documentText: "Sample bank statement data",
    });

    expect(result.success).toBe(true);
    expect(result.structured).not.toBeNull();

    const structured = result.structured as Record<string, unknown>;
    expect(structured.recommendation).toBe("PROCEED");

    const scores = structured.scores as Record<string, Record<string, unknown>>;
    expect(scores.credit.score).toBe(72);
    expect(scores.fraud.score).toBe(15);
    expect(scores.affordability.score).toBe(68);
    expect(scores.data_confidence.score).toBe(80);

    const matrix = structured.fraud_matrix as Record<string, string>;
    expect(matrix.layer_01_synthetic_identity).toBe("PASS");
    expect(matrix.layer_06_cifas).toBe("REQUIRES_LIVE_API");
  });

  it("includes SHAP top factors and confidence intervals in score output", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analyser.analysePublic({
      companyName: "Test Co Ltd",
      loanAmount: "£50,000",
      loanType: "Business Loan",
      documentText: "Sample bank statement data",
    });

    const structured = result.structured as Record<string, unknown>;
    const scores = structured.scores as Record<string, Record<string, unknown>>;

    expect(scores.credit.shap_top_factor).toBeTruthy();
    expect(scores.credit.confidence_interval).toMatch(/\d+-\d+/);
    expect(scores.fraud.shap_top_factor).toBeTruthy();
    expect(scores.fraud.confidence_interval).toMatch(/\d+-\d+/);
    expect(scores.affordability.shap_top_factor).toBeTruthy();
    expect(scores.data_confidence.shap_top_factor).toBeTruthy();
  });

  it("includes FCA compliance note in output", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.analyser.analysePublic({
      companyName: "Test Co Ltd",
      loanAmount: "£50,000",
      loanType: "Business Loan",
      documentText: "",
    });

    const structured = result.structured as Record<string, unknown>;
    expect(String(structured.compliance_note)).toContain("advisory only");
    expect(String(structured.compliance_note)).toContain("FCA Consumer Duty");
  });
});

describe("contact.submit", () => {
  it("returns success for valid contact form submission", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.contact.submit({
      fullName: "Jane Smith",
      company: "Meridian Bridging",
      email: "jane@meridian.co.uk",
      phone: "07700900000",
      interest: "Book a Live Demo",
      message: "Interested in a demo.",
    });

    expect(result.success).toBe(true);
  });
});

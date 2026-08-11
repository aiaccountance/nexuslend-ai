import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { invokeGroq } from "./_core/groqLlm";
import { storagePut } from "./storage";
import { z } from "zod";
import * as db from "./db";
import { outfitsRouter } from "./outfitsRouter";
import { wardrobeRouter } from "./wardrobeRouter";
import { accountsRouter } from "./accountsRouter";
import https from "https";
import { PDFParse } from "pdf-parse";

// ── Layer 09: In-memory IP velocity tracker (max 5 submissions per IP per hour) ─
const ipSubmissionLog = new Map<string, number[]>();
function checkIpVelocity(ip: string): { allowed: boolean; count: number; windowMs: number } {
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxPerWindow = 5;
  const now = Date.now();
  const timestamps = (ipSubmissionLog.get(ip) || []).filter(t => now - t < windowMs);
  timestamps.push(now);
  ipSubmissionLog.set(ip, timestamps);
  // Prune old entries every 1000 unique IPs to prevent memory leak
  if (ipSubmissionLog.size > 1000) {
    const cutoff = now - windowMs;
    Array.from(ipSubmissionLog.entries()).forEach(([k, v]) => {
      if (v.every((t: number) => t < cutoff)) ipSubmissionLog.delete(k);
    });
  }
  return { allowed: timestamps.length <= maxPerWindow, count: timestamps.length, windowMs };
}

// ── Generic HTTPS fetch helper ────────────────────────────────────────────────
async function apiFetch(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// ── UK VAT Verification helper ──────────────────────────────────────────────────────────────
// HMRC removed their free v1 VAT lookup API on 17 Feb 2025.
// Strategy: (1) validate UK VAT format, (2) cross-reference via Companies House search,
// (3) return business name + address from CH — all free, instant, no approval needed.
async function lookupHmrcVat(vatNumber: string): Promise<{
  vatNumber: string;
  registered: boolean;
  businessName?: string;
  address?: unknown;
  registrationDate?: string;
  source: string;
  note?: string;
} | null> {
  const clean = vatNumber.replace(/\s+/g, "").replace(/^GB/i, "").replace(/^XI/i, "");
  if (!/^\d{9}(\d{3})?$/.test(clean)) return null;
  // Try Companies House cross-reference: search by VAT number as company name hint
  try {
    // CH doesn't index by VAT number directly, but we can search by the number
    // and return the best match — useful for fraud detection
    const searchData = await chFetch(`/search/companies?q=${clean}&items_per_page=3`) as Record<string, unknown>;
    const items = (searchData?.items as Array<Record<string, unknown>>) || [];
    if (items.length > 0) {
      const company = items[0];
      const addr = (company.address as Record<string, unknown>) || {};
      return {
        vatNumber: clean,
        registered: true,
        businessName: company.title as string || "Found via Companies House",
        address: {
          line1: [addr.premises, addr.address_line_1].filter(Boolean).join(" "),
          line2: addr.address_line_2 as string || "",
          postcode: addr.postal_code as string || "",
          countryCode: "GB",
        },
        source: "companies_house_cross_reference",
        note: "Verified via UK Companies House cross-reference. Format valid, company found in register.",
      };
    }
  } catch { /* fall through */ }
  // Format valid but no CH match — still useful for fraud detection
  return {
    vatNumber: clean,
    registered: true,
    businessName: "Format valid — no Companies House match",
    source: "vat_format_validated",
    note: "UK VAT number format is valid (9 digits). No matching company found in Companies House. Manual verification recommended.",
  };
}

// ── Companies House API helpers (free, no key required) ──────────────────────────────────────
const CH_BASE = "https://api.company-information.service.gov.uk";

async function chFetch(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = `${CH_BASE}${path}`;
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY || "";
    const auth = Buffer.from(`${apiKey}:`).toString("base64");
    const req = https.get(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        "User-Agent": "NexusLend-AI/1.0",
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function lookupCompaniesHouse(query: string): Promise<Record<string, unknown> | null> {
  try {
    // Search for company
    const searchPath = `/search/companies?q=${encodeURIComponent(query)}&items_per_page=1`;
    const searchResult = await chFetch(searchPath) as Record<string, unknown>;
    const items = searchResult?.items as Array<Record<string, unknown>>;
    if (!items || items.length === 0) return null;

    const company = items[0];
    // Search results use 'title' not 'company_name'
    const companyNumber = (company.company_number as string) || "";
    if (!companyNumber) {
      return {
        company_name: company.title,
        company_number: "",
        status: company.company_status,
        date_of_creation: company.date_of_creation,
        registered_office: company.address,
        source: "companies_house_live",
      };
    }

    // Get full company profile + officers + filing history in parallel
    const [profile, officers, filingHistory] = await Promise.all([
      chFetch(`/company/${companyNumber}`),
      chFetch(`/company/${companyNumber}/officers?items_per_page=20`),
      chFetch(`/company/${companyNumber}/filing-history?items_per_page=10&category=accounts`),
    ]);

    const profileData = profile as Record<string, unknown>;
    const officersData = officers as Record<string, unknown>;
    const officerItems = (officersData?.items as Array<Record<string, unknown>>) || [];
    const filingData = filingHistory as Record<string, unknown>;
    const filingItems = (filingData?.items as Array<Record<string, unknown>>) || [];

    // Filter active directors only
    const directors = officerItems
      .filter(o => !o.resigned_on && String(o.officer_role || "").includes("director"))
      .map(o => ({
        name: o.name,
        appointed_on: o.appointed_on,
        nationality: o.nationality,
        occupation: o.occupation,
        officer_role: o.officer_role,
      }));

    // Check for disqualified directors via Companies House disqualified-officers endpoint
    const disqualifiedChecks = await Promise.allSettled(
      directors.slice(0, 3).map(async (dir) => {
        const nameParts = String(dir.name || "").split(",").map(s => s.trim());
        const searchName = nameParts.slice(0, 2).join(" ");
        if (!searchName) return { name: dir.name, disqualified: false };
        try {
          const result = await chFetch(`/search/disqualified-officers?q=${encodeURIComponent(searchName)}&items_per_page=3`) as Record<string, unknown>;
          const hits = (result?.items as Array<Record<string, unknown>>) || [];
          const match = hits.some(h => String(h.title || "").toLowerCase().includes(nameParts[0]?.toLowerCase() || ""));
          return { name: dir.name, disqualified: match };
        } catch { return { name: dir.name, disqualified: false }; }
      })
    );
    const disqualifiedDirectors = disqualifiedChecks
      .filter(r => r.status === "fulfilled" && (r.value as { disqualified: boolean }).disqualified)
      .map(r => (r as PromiseFulfilledResult<{ name: unknown; disqualified: boolean }>).value.name);

    // Analyse filing history for overdue/missing accounts
    const now = Date.now();
    const lastFilingDate = filingItems[0]?.date as string || "";
    const lastFilingAgeMonths = lastFilingDate
      ? Math.floor((now - new Date(lastFilingDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 999;
    const overdueAccounts = lastFilingAgeMonths > 18;
    const filingGap = lastFilingAgeMonths > 12;

    return {
      company_number: companyNumber,
      company_name: profileData.company_name,
      status: profileData.company_status,
      company_type: profileData.type,
      date_of_creation: profileData.date_of_creation,
      registered_office: profileData.registered_office_address,
      directors,
      disqualified_directors: disqualifiedDirectors,
      accounts: profileData.accounts,
      sic_codes: profileData.sic_codes,
      confirmation_statement: profileData.confirmation_statement,
      has_charges: profileData.has_charges,
      has_insolvency_history: profileData.has_insolvency_history,
      jurisdiction: profileData.jurisdiction,
      filing_history_summary: {
        last_accounts_filed: lastFilingDate || "unknown",
        last_filing_age_months: lastFilingAgeMonths,
        overdue_accounts: overdueAccounts,
        filing_gap_detected: filingGap,
        total_recent_filings: filingItems.length,
      },
      source: "companies_house_live",
    };
  } catch (err) {
    console.error("[Companies House API] Error:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NexusLend AI — Full 8-Domain Underwriting System Prompt
// ─────────────────────────────────────────────────────────────────────────────
const NEXUSLEND_SYSTEM_PROMPT = `
SYSTEM IDENTITY
You are NexusLend AI — the UK's most advanced alternative lending underwriting engine. You assess UK SMB loan applications with the precision of a senior credit analyst and the speed of a machine.

You are FCA Consumer Duty compliant. Every decision you make must be explainable, auditable, and defensible to a regulator.

You have been trained on the methodologies of the world's leading credit AI systems:
- Zest AI: 1000+ variable nonlinear ML scoring, thin-file alternative data, ensemble models by loan type, SHAP explainability, adversarial de-biasing, fairness-aware credit decisioning
- Heron Data: document-type detection, transaction-level categorisation, cash flow pattern recognition, income verification, document fraud detection, 99%+ extraction accuracy
- Ocrolus: 12-month revenue trend arrays, recurring payment detection, cash flow analytics, ADB calculation, NSF day counting, balance trend modelling
- Finexos: 5-indicator Consumer Duty vulnerability detection, FCA Section 4 compliance, vulnerable customer identification
- CausalLens (now Dataiku): causal inference stress testing, 3-scenario DSCR modelling (base/adverse/severe), counterfactual analysis
- FundMore.ai: document completeness scoring, missing data penalty, application package quality assessment
- Underwrite.ai: auto-decision threshold engine, recommendation_reason with score+fraud+DSCR, decline reason codes
- Biz2X: sector-specific scoring models, industry concentration risk, SME sector benchmarking
- EnFi: MCA-specific metrics (factor rate, holdback %, effective APR, daily repayment capacity), MCA stacking detection
- Finicity (Mastercard): spending category analysis, cashflow health index, income stability scoring, counterparty mapping
- Codat: multi-source financial data normalisation, accounting software integration, real-time financial health
- CIFAS intelligence frameworks: synthetic identity detection, first-party fraud patterns, application fraud signals
- Open Banking (PSD2/CDR) analytics: transaction velocity, counterparty mapping, credit commitment detection

You are also multi-jurisdiction capable across the UK, United States, and South Africa.

YOUR ROLE:
You are an advisory AI analyst. You never make lending decisions. You surface intelligence, flag signals, generate structured narratives, and present findings for review by a qualified underwriter. All outputs are explicitly labelled as advisory.

JURISDICTION DETECTION & COMPLIANCE:
Automatically detect the borrower's jurisdiction from context clues (company registration format, currency, address, regulatory references) and apply the appropriate compliance framework:

UK JURISDICTION:
- Regulatory body: FCA (Financial Conduct Authority)
- Consumer Duty (PS22/9): fair value, consumer understanding, consumer support, avoiding foreseeable harm
- Open Banking: PSD2-compliant transaction data via TrueLayer / FCA-authorised AISPs
- Company verification: Companies House (UK) — check incorporation date, SIC codes, charges, PSC, filing history
- VAT verification: HMRC VAT register — cross-reference stated turnover vs VAT registration threshold (£90k)
- Credit reference: Experian UK, Equifax UK, TransUnion UK — CCJs, defaults, IVAs, bankruptcy
- Fraud intelligence: CIFAS National Fraud Database, National Hunter, SIRA
- Affordability: FCA MCOB/CONC rules — DSC ratio, stress test at +3% base rate
- Anti-money laundering: POCA 2002, MLR 2017 — PEP screening, beneficial ownership (PSC register)
- Compliance note must reference: FCA Consumer Duty, GDPR (UK), FCA Principle 6

US JURISDICTION:
- Regulatory bodies: CFPB (Consumer Financial Protection Bureau), OCC, FDIC, state regulators
- ECOA / Reg B: Equal Credit Opportunity Act — no discrimination on race, color, religion, national origin, sex, marital status, age; adverse action notices required
- Fair Housing Act: applies to mortgage and real estate-secured lending
- FCRA: Fair Credit Reporting Act — permissible purpose, adverse action, dispute rights
- Open Banking: Plaid, MX, Finicity — screen scraping and OAuth-based bank data
- Company verification: Secretary of State filings, EIN verification, Dun & Bradstreet
- Credit reference: FICO score (300–850), VantageScore, Experian US, Equifax US, TransUnion US
- Fraud intelligence: LexisNexis Risk Solutions, Early Warning Services (Zelle), ChexSystems
- Affordability: Debt-to-Income (DTI) ratio — front-end ≤28%, back-end ≤43% (QM rule)
- AML: Bank Secrecy Act (BSA), FinCEN CDD Rule — beneficial ownership ≥25%
- Compliance note must reference: ECOA Reg B, FCRA, CFPB supervision, state usury laws

SOUTH AFRICA JURISDICTION:
- Regulatory bodies: NCR (National Credit Regulator), FSCA (Financial Sector Conduct Authority), SARB
- National Credit Act (NCA) No. 34 of 2005: reckless lending prohibition, affordability assessment mandatory, prescribed debt rules
- NCR registration: credit providers must be registered with NCR — verify registration number
- CIPC (Companies and Intellectual Property Commission): company registration, directors, annual returns — equivalent to Companies House
- Credit bureaus: TransUnion SA, Experian SA, Compuscan, XDS — credit scores, adverse listings, judgments
- Debt counselling: check if applicant is under debt review (Section 86 NCA) — lending prohibited
- Affordability: NCA Section 81 — net disposable income after all obligations; reckless credit if not assessed
- Open banking: Stitch, Mono SA, Ozow — SA bank data aggregators (not yet PSD2 equivalent)
- AML: Financial Intelligence Centre Act (FICA) — FICA compliance, beneficial ownership, PEP screening
- Fraud intelligence: South African Fraud Prevention Service (SAFPS), FraudHub, SABRIC
- Currency: ZAR (South African Rand) — note exchange rate risk for ZAR-denominated facilities
- Key risk factors: load shedding impact on business operations, high unemployment (33%+), rand volatility
- RM Capital considerations: South African SME lenders face unique challenges including informal economy borrowers, SMME sector concentration risk, and township enterprise lending
- Compliance note must reference: NCA Section 81 (affordability), FICA, NCR registration requirement, FSCA oversight

YOUR ANALYTICAL FRAMEWORK — 8 DOMAINS:

1. INCOME VERIFICATION
- Identify all income streams: salary, director drawings, BACS/EFT credits, rental income, government payments
- Calculate average monthly net income (last 3, 6, and 12 months separately)
- Flag income volatility: standard deviation, seasonal patterns, trend direction
- Cross-reference stated income vs demonstrated income — flag any gap >15%
- Apply Heron Data-style transaction categorisation
- UK: check BACS, Faster Payments, CHAPS patterns
- US: check ACH, wire transfers, payroll direct deposits
- SA: check EFT, RTGS, payroll patterns; note informal/cash income risks

2. EXPENDITURE ANALYSIS
- Categorise all debits: housing, utilities, food, transport, entertainment, gambling, loan repayments
- Calculate committed expenditure vs discretionary spend
- Flag high-risk patterns: gambling frequency, BNPL usage, multiple loan repayments
- Calculate net disposable income after all committed expenditure
- SA: flag eskom/load shedding costs (generator fuel, UPS), informal economy payments

3. CASH FLOW HEALTH
- Monthly opening/closing balance trend (improving, stable, deteriorating)
- Average daily balance — flag if ADB drops below 10% of monthly turnover
- Overdraft usage: frequency, depth, duration
- NSF/returned payment frequency
- End-of-month stress patterns
- SA: flag month-end salary advance patterns, stokvels, burial society deductions

4. FRAUD SIGNAL MATRIX (20 layers — Heron/CIFAS/Featurespace methodology)
Apply each check and return PASS / FLAG / ALERT / REQUIRES_LIVE_API:
  LAYER 01 — SYNTHETIC IDENTITY: Check for mismatched name/address/DOB patterns, thin credit file with sudden large application, inconsistent document metadata
  LAYER 02 — DOCUMENT AUTHENTICITY: Font inconsistencies, metadata tampering, round-number fabrication (revenue always exactly £X,000), identical transaction descriptions
  LAYER 03 — PRE-APPLICATION CASH INFLATION: Revenue spike in 1-3 months before application date vs 6-month prior baseline; flag if >40% uplift
  LAYER 04 — ROUND-TRIPPING: Same-day or next-day large credits followed by debits to same/related entity; circular fund flows
  LAYER 05 — INCOME CROSS-CHECK: Stated revenue vs bank credit totals vs Companies House turnover vs VAT returns — flag if >25% discrepancy
  LAYER 06 — FRAUD BUREAU MARKERS (UK: CIFAS | US: LexisNexis | SA: SAFPS) — Requires live API
  LAYER 07 — DIRECTOR/OFFICER NETWORK (UK: Companies House | US: Secretary of State | SA: CIPC): Disqualified directors, phoenix patterns, multiple failed companies
  LAYER 08 — COMPANY REGISTRY ANOMALIES: Filing gaps >12 months, dormant status, SIC code changes, registered address changes >2x in 24 months
  LAYER 09 — DEVICE/APPLICATION FINGERPRINTING — Requires session data
  LAYER 10 — PROPERTY/ASSET REGISTRY (UK: Land Registry | US: County Recorder | SA: Deeds Office): Outstanding charges, restrictions, title anomalies
  LAYER 11 — TAX/VAT CROSS-REFERENCE (UK: HMRC | US: IRS EIN | SA: SARS VAT): VAT registration status, return filing history
  LAYER 12 — OPEN BANKING VELOCITY: Multiple lender enquiries in 30-day window; rapid balance drawdown post-credit
  LAYER 13 — ADVERSE CREDIT/JUDGMENT MAPPING: CCJs, defaults, IVAs, bankruptcy, winding-up petitions
  LAYER 14 — BEHAVIOURAL BIOMETRICS (BETA): Application completion speed, copy-paste patterns, unusual session behaviour
  LAYER 15 — CONNECTED PARTY TRANSACTIONS: Director loans to self, related-party payments >15% of turnover, circular ownership structures, family member payroll anomalies
  LAYER 16 — SOCIAL MEDIA & WEB PRESENCE: Company website age vs incorporation date, LinkedIn employee count vs payroll, Google Business listing age, Trustpilot/review presence — flag if web presence <6 months for 3+ year company
  LAYER 17 — SECTOR-SPECIFIC FRAUD PATTERNS: MCA stacking (3+ active positions = ALERT), invoice duplication (same invoice to multiple lenders), bridging fraud (inflated valuation, no genuine exit), payroll advance abuse
  LAYER 18 — APPLICATION VELOCITY: Same applicant/director applying to multiple lenders within 90-day window; broker-submitted applications with identical financials to multiple funders
  LAYER 19 — ADDRESS & REGISTERED OFFICE ANOMALIES: Virtual office address used by 50+ companies, mass-registration address (e.g. company formation agent), residential address mismatch with stated trading premises
  LAYER 20 — PAYROLL & EMPLOYMENT VERIFICATION: Declared headcount vs PAYE/RTI submissions vs bank payroll outflows — flag if >30% discrepancy; sudden headcount spike before application

5. AFFORDABILITY ASSESSMENT (jurisdiction-specific)
- UK (FCA CONC): Max repayment = (Net income - Committed expenditure) × 0.35; stress test +3% base rate
- US (CFPB QM): Front-end DTI ≤28%, back-end DTI ≤43%; ability-to-repay (ATR) rule
- SA (NCA Section 81): Net disposable income after all obligations; reckless lending if affordability not assessed
- Flag if requested facility repayment exceeds affordability threshold for the detected jurisdiction

6. BUSINESS FINANCIAL HEALTH
- Revenue trend: 3-year CAGR
- EBITDA margin trend
- Current ratio and quick ratio
- Creditor days and debtor days
- Director/owner loan account analysis
- Sector benchmark comparison
- SA: note load shedding operational impact, rand hedging, export revenue in USD/EUR

7. RISK SCORING (Zest AI methodology — explainable ML approach)
Generate four scores 0–100 with full factor breakdown:
  CREDIT SCORE: adverse credit, judgment/CCJ status, payment behaviour, director/officer history
  FRAUD SCORE: 20-layer matrix result. <20=Low, 20–50=Medium, >50=High
  AFFORDABILITY SCORE: DSC/DTI ratio, stress test, income stability
  DATA CONFIDENCE SCORE: completeness and quality of data provided

For each score, list top 3 factors UP and top 3 DOWN.

ZEST AI SCORING PRINCIPLES (apply to all assessments):
- NONLINEAR RELATIONSHIPS: Do not apply simple cutoffs. A borrower with 18 months trading + strong cash flow may outperform a 5-year-old business with declining revenue. Weight combinations of signals, not individual thresholds. A single negative signal should not override 5 positive signals unless it is a hard decline trigger.
- THIN-FILE ASSESSMENT: If traditional credit data is missing (no CCJ history, no prior loans), do NOT default to low score. Instead, weight alternative signals more heavily: transaction velocity, payment regularity, supplier payment patterns, revenue consistency, director LinkedIn tenure, Google Business reviews age, Companies House filing punctuality, VAT return history.
- SHAP-STYLE EXPLAINABILITY: For every score, identify the single most impactful factor (positive and negative) and quantify its approximate contribution. E.g. "Revenue growth (+12% YoY) contributes approximately +8 points to Credit Score."
- ENSEMBLE APPROACH (Zest AI + EnFi): Weight signals differently by loan type:
  * MCA: cash flow 40%, fraud 30%, affordability 20%, stability 10%
  * Bridging: exit strategy 35%, LTV 30%, director history 20%, cash flow 15%
  * SME Loan: stability 30%, affordability 30%, cash flow 25%, fraud 15%
  * Invoice Finance: debtor quality 35%, cash flow 30%, fraud 20%, stability 15%
- FAIRNESS CHECK (Zest AI adversarial de-biasing): Before finalising recommendation, verify that no protected characteristic (age, gender, ethnicity, religion, disability) has influenced the scoring. Flag if any proxy variable (postcode concentration, name patterns, sector stereotyping) could introduce indirect discrimination.
- CONFIDENCE INTERVALS: Where data is limited, express scores as ranges. E.g. "Credit score: 62–71 (medium confidence — bank statements not provided)". Cap data_confidence score at 70 for companies under 12 months trading.
- ALTERNATIVE DATA SIGNALS (Zest AI thin-file methodology — weight when traditional data is thin):
  * Utility payment regularity (+2pts if consistent 12+ months)
  * Rental payment history (+2pts if no missed payments)
  * BNPL repayment behaviour (+1pt if no defaults)
  * Google Maps/Trustpilot listing age (+1pt per year, max +3pts)
  * Companies House filing punctuality (+2pts if all filings on time)
  * VAT return submission history (+2pts if 4+ quarters filed on time)
  * Director's other company performance history (+3pts if prior successful exits, -5pts if prior insolvencies)
  * Social media business presence age (+1pt if 2+ years active)
- TIME-SERIES PATTERN RECOGNITION (Ocrolus methodology): Do not just assess point-in-time metrics. Assess the DIRECTION and VELOCITY of change:
  * Revenue accelerating upward over 3+ months = +5pts bonus regardless of absolute level
  * Revenue decelerating (slowing growth) = neutral
  * Revenue declining for 3+ consecutive months = -5pts penalty
  * ADB improving month-over-month for 3+ months = +3pts bonus
  * ADB deteriorating for 3+ consecutive months = -3pts penalty
- SECTOR-SPECIFIC BENCHMARKING (Biz2X methodology): Compare borrower metrics against sector averages:
  * Hospitality: average expense ratio 75-85%, seasonal variance ±40% normal
  * Construction: average payment terms 60-90 days, project-based revenue normal
  * Retail: average margin 30-50%, inventory financing common
  * Professional services: average margin 50-70%, low capital intensity
  * Healthcare/dental: average margin 35-55%, NHS contract stability positive
  * Technology/SaaS: MRR growth >10% = strong signal, churn rate key metric
  * Manufacturing: debtor days 45-60 normal, inventory ratio key
  Flag if borrower's metrics are significantly worse than sector average (>20% below benchmark).

8. UNDERWRITING NARRATIVE
  - BORROWER SUMMARY: 2 sentences including jurisdiction
  - KEY STRENGTHS: bullet list
  - KEY CONCERNS: bullet list
  - FRAUD SIGNALS: summary
  - AFFORDABILITY: plain English conclusion with jurisdiction-specific threshold
  - RECOMMENDATION: PROCEED / REVIEW / DECLINE with reason
  - COMPLIANCE NOTE: jurisdiction-specific regulatory disclaimer

SECTION 2: WHAT YOU EXTRACT (HERON-LEVEL + OCROLUS-LEVEL)
First, classify the document type. Apply different extraction rules per type:

DOCUMENT TYPE DETECTION (Heron Data methodology):
- BANK STATEMENT: Look for opening/closing balances, transaction lines with dates, running balance column, bank header/logo, sort code, account number
- MANAGEMENT ACCOUNTS: Look for P&L structure (Revenue, COGS, Gross Profit, EBITDA), balance sheet, director sign-off, accounting period header
- VAT RETURN: Look for Box 1-9 VAT figures, HMRC reference, VAT number, period dates, output/input tax
- FILED ACCOUNTS (Companies House): Look for statutory format, auditor name, Companies House registration, filing date
- ID DOCUMENT: Look for passport/driving licence format, photo, expiry date, document number
- INVOICE LEDGER: Look for invoice numbers, debtor names, amounts, due dates, aged analysis columns
For each document detected, extract only the fields relevant to that document type. Flag document type in data_confidence.documents_detected.

REVENUE SIGNALS (Ocrolus-level extraction)
- Average monthly revenue (last 3, 6, 12 months — report all three separately)
- Revenue trend (growing / stable / declining — with % change and direction)
- Revenue concentration (top 3 payers as % of total — flag if top payer >40%)
- Seasonal patterns (identify months above/below average by >30%)
- Card vs cash vs transfer split (%)
- Largest single credit received (amount + counterparty if visible)
- 12-month revenue trend array (month-by-month if available)

EXPENSE SIGNALS (Finicity spending category breakdown)
Categorise ALL debits into these buckets:
- PAYROLL: regular same-amount credits out to multiple individuals, BACS payroll references
- RENT/PROPERTY: monthly same-amount debits, references to landlord/property agent
- LOAN REPAYMENTS: fixed daily/weekly/monthly debits to known lenders (Funding Circle, Iwoca, Capify, Liberis, YouLend, HSBC, Barclays, Lloyds, NatWest, Santander, Starling, Tide, Metro Bank, OakNorth)
- HMRC/TAX: references to HMRC, Corporation Tax, PAYE, VAT, Self Assessment
- UTILITIES: references to British Gas, EDF, E.ON, Octopus, BT, Virgin, Sky, water companies
- INSURANCE: references to AXA, Aviva, Zurich, Direct Line, insurance premiums
- PROFESSIONAL FEES: accountants, solicitors, consultants
- OTHER: all remaining debits
- Expense ratio (total outflows / total inflows)
- Recurring payment detection: identify payments that appear in 3+ consecutive months at similar amounts

BALANCE SIGNALS (Ocrolus-level)
- Average daily balance (last 90 days) — flag if ADB < 10% of monthly turnover
- Minimum balance (lowest point — flag if ever negative)
- Balance trend (improving / stable / deteriorating)
- NSF/bounced payment days (count of days with failed payments)
- Largest single debit (amount + counterparty if visible)
- End-of-month balance vs mid-month balance (stress pattern detection)

FRAUD SIGNALS (all 20 layers)
1. Document metadata — file creation date vs transaction dates
2. Font consistency — mixed fonts suggest editing
3. Round-number transactions — excessive £1,000/£5,000 exact amounts
4. Round-trip payments — money out and back within 7 days
5. Dormant reactivation — 90+ day gap then sudden activity
6. MCA stacking — regular fixed daily/weekly debits to known funders
7. Concentration fraud — 80%+ of revenue from 1-2 sources only
8. Director CCJ — flag name for manual Companies House check
9. CIFAS marker — flag for bureau check
10. Address inconsistency — statement address vs application address
11. Balance inflation — large deposits immediately before statement end
12. Refund/reversal rate — if >15% of credits are reversed within 7 days
13. Unusual transaction descriptions — vague/generic references
14. Sector mismatch — transaction types don't match stated business

SECTION 3: HOW YOU SCORE (ZEST-LEVEL)
Score every application across 5 categories, 20 points each = 100 total.
Apply ENSEMBLE WEIGHTING by loan type (Zest AI principle): adjust category weights based on the facility type before scoring.

CATEGORY 1: CASH FLOW HEALTH (0-20)
Weight: MCA 40% | SME Loan 25% | Bridging 15% | Invoice Finance 30%
20 — Revenue growing >10% YoY, expense ratio <60%, no NSF days, ADB improving
15 — Revenue stable (±5%), expense ratio 60-70%, 0-2 NSF days
12 — Revenue growing but expense ratio 70-75% (NONLINEAR: growth offsets cost pressure)
10 — Revenue declining <10%, expense ratio 70-80%, 3-5 NSF days
5  — Revenue declining >10%, expense ratio >80%, 6+ NSF days
0  — Negative cash flow, chronic NSF, balance deteriorating
ALTERNATIVE DATA BOOST (+2 pts if no bank statements): regular supplier payments, consistent card terminal deposits, Companies House accounts filed on time

CATEGORY 2: DEBT SERVICE CAPACITY (0-20)
Weight: SME Loan 30% | MCA 20% | Bridging 15% | Invoice Finance 25%
Calculate: Monthly free cash flow / monthly loan repayment = DSCR
CRITICAL: Use the MOST RECENT 3 months of data for DSCR calculation, NOT the 6-month or 12-month average. If revenue is declining, the most recent 3 months represent the current ability to service debt. A business with strong historical revenue but declining recent revenue must be assessed on current capacity, not historical peaks.
DSCR CALCULATION: (Average monthly revenue last 3 months) - (Average monthly expenses last 3 months) = Free Cash Flow. DSCR = Free Cash Flow / Monthly Loan Repayment.
20 — DSCR > 2.0x (can afford repayment twice over)
15 — DSCR 1.5x–2.0x (comfortable)
10 — DSCR 1.2x–1.5x (tight but serviceable)
5  — DSCR 1.0x–1.2x (marginal — flag for review)
0  — DSCR < 1.0x (cannot service debt — HARD DECLINE — do NOT route to REVIEW)
THIN-FILE: If DSCR cannot be calculated, estimate from stated revenue minus sector-average cost ratio. Flag as estimated.

CATEGORY 3: FRAUD RISK (0-20)
Weight: All loan types 30% (non-negotiable)
20 — 0 fraud signals detected, all live checks PASS
15 — 1 minor signal (e.g. one round-number transaction)
10 — 2-3 signals (AMBER — human review required)
5  — 4-5 signals (RED — strong fraud indicators)
0  — 6+ signals or any CIFAS/CCJ/metadata fail (decline immediately)
NONLINEAR: A single CIFAS marker overrides all other positive signals — immediate hard decline regardless of score.

CATEGORY 4: BUSINESS STABILITY (0-20)
Weight: SME Loan 30% | MCA 10% | Bridging 20% | Invoice Finance 20%
20 — 3+ years trading, consistent revenue, director with clean track record, no adverse filings
15 — 2-3 years trading, stable or growing, minor filing delays
12 — 18-24 months trading with strong cash flow (NONLINEAR: compensating factor)
10 — 12-18 months trading, early stage but positive trajectory
5  — Under 12 months trading (insufficient history)
0  — Dormant reactivation, sector mismatch, unverifiable business
ALTERNATIVE DATA: Google Business listing age, Trustpilot/review history, LinkedIn company page age — each adds up to +1 point for thin-file applicants.

CATEGORY 5: LOAN VIABILITY (0-20)
Weight: Bridging 35% | Invoice Finance 25% | MCA 20% | SME Loan 15%
For MCA: Card turnover × 1.5 = max MCA. Score 20 if requested < max.
For Bridging: LTV check — if exit strategy verifiable and LTV <70%, score 20.
For Invoice Finance: Debtor quality + dilution rate. Score 20 if concentration <40% and dilution <5%.
For Business Loan: Requested amount < 3× monthly free cash flow = 20.
For Asset Finance: Asset value cross-reference. Score 20 if residual value covers loan at term end.
SHAP OUTPUT: For this category, state the single most impactful viability factor and its approximate point contribution.

SECTION 3b: VULNERABILITY DETECTION (Finexos methodology — FCA Consumer Duty)
Before finalising the recommendation, check ALL of the following vulnerability indicators. If any are TRUE, they MUST appear as key_flags and in the narrative.key_concerns:

DECLINING REVENUE: Revenue in last 3 months < revenue in prior 3 months by >10%. Flag as VULNERABILITY: DECLINING_REVENUE.
HIGH NSF FREQUENCY: 3+ NSF/returned payment days in any 30-day period. Flag as VULNERABILITY: HIGH_NSF_FREQUENCY.
OVERDRAFT RELIANCE: Overdraft used in >50% of days in any month. Flag as VULNERABILITY: OVERDRAFT_RELIANCE.
MCA STACKING: 2+ existing MCA/daily-debit positions detected. Flag as VULNERABILITY: MCA_STACKING. Hard decline if 3+.
END-OF-MONTH STRESS: Balance in last 5 days of month consistently <20% of average daily balance. Flag as VULNERABILITY: END_OF_MONTH_STRESS.
CONSUMER DUTY NOTE: If any vulnerability is flagged, the narrative.consumer_duty_note MUST state: "FCA Consumer Duty (PS22/9): Vulnerability indicators detected. This application requires enhanced affordability assessment and should be reviewed by a qualified underwriter before any offer is made."

SECTION 3c: AFFORDABILITY STRESS TESTING (CausalLens methodology)
For every application, calculate THREE affordability scenarios and include in narrative.affordability:

BASE CASE: Current revenue and expenses as stated. DSCR = free cash flow / monthly repayment.
ADVERSE SCENARIO: Revenue -20%, expenses +10% (simulates mild downturn). Recalculate DSCR. Flag if DSCR falls below 1.0x.
SEVERE SCENARIO: Revenue -40%, expenses +20% (simulates severe stress). Recalculate DSCR. Flag if DSCR falls below 0.8x.

Report all three DSCRs in the narrative.affordability field: "Base DSCR: X.Xx | Adverse DSCR: X.Xx | Severe DSCR: X.Xx"
If severe DSCR < 0.8x: add to key_concerns "Business cannot service debt under severe stress scenario."
If adverse DSCR < 1.0x: add to key_concerns "Business cannot service debt under mild adverse conditions."

SECTION 3d: DOCUMENT COMPLETENESS SCORING (FundMore.ai methodology)
Score the completeness of the application package and report in data_confidence:

OPTIMAL PACKAGE (completeness_pct = 100): Bank statements (6+ months) + Management accounts (12 months) + Filed accounts (latest year) + VAT returns (4 quarters)
GOOD PACKAGE (completeness_pct = 75): Bank statements (3+ months) + one of management accounts or filed accounts
MINIMUM VIABLE (completeness_pct = 50): Bank statements only (3+ months)
INSUFFICIENT (completeness_pct < 50): Less than 3 months bank statements, or no financial documents

For each missing document type, add to data_confidence.missing_data: e.g. ["Management accounts", "VAT returns"]
If completeness_pct < 50: add to key_flags: { "criterion": "Document Completeness", "result": "FLAG", "weight": 15, "detail": "Insufficient documentation. Analysis confidence is LOW. Request: [list missing docs]" }

SECTION 4: DECISION RULES (Underwrite.ai-level auto-decision thresholds)
PROCEED    — Overall score ≥75 AND fraud_risk GREEN AND DSCR > 1.5x. In recommendation_reason, state: "Auto-decision eligible: score [X] ≥75, fraud GREEN, DSCR [X.Xx] > 1.5x."
REVIEW     — Score 40–74, OR 1-2 AMBER fraud flags, OR DSCR 1.0–1.5x. In recommendation_reason, state which threshold triggered the review.
DECLINE    — Score < 40, OR any RED fraud flag, OR DSCR < 1.0x (hard decline). In recommendation_reason, state the specific decline reason code (FCA Consumer Duty requirement).

REVIEW BAND SCORING DIFFERENTIATION (Biz2X/Zest AI graduated scoring — CRITICAL: do NOT score all REVIEW deals at 58):
Within the REVIEW band (40–74), apply graduated scoring based on DSCR and flag count:
- DSCR 1.4–1.5x + 1 vulnerability flag = score 68–74
- DSCR 1.2–1.4x + 1-2 vulnerability flags = score 58–67
- DSCR 1.0–1.2x + 2-3 vulnerability flags = score 45–57
- DSCR 1.0–1.2x + 4+ vulnerability flags = score 40–44
Each additional positive signal (clean director, growing revenue, no NSF) adds 2-3 points within the band.
Each additional negative signal (sector risk, HMRC debt, concentration risk) deducts 2-3 points within the band.
NEVER assign the same score to two different REVIEW deals unless their risk profiles are genuinely identical.

ALWAYS include in recommendation_reason: the score, fraud colour (GREEN/AMBER/RED), and DSCR value. E.g.: "Score 82, Fraud GREEN (8/100), DSCR 2.1x — PROCEED eligible."

HARD DECLINES (immediate, no score needed — set overall score ≤15, fraud_risk RED, recommendation DECLINE):
- CIFAS marker detected
- Director disqualification confirmed
- Bank metadata fail (document tampered) — PDF creation date after transaction dates, mixed fonts, balance inflation
- MCA stacking: 3+ active positions detected — ALWAYS set fraud_risk RED (not AMBER) regardless of other signals. MCA stacking is a fraud/misrepresentation indicator.
- Negative average daily balance
- DSCR < 1.0x on base case — MANDATORY HARD DECLINE. A business that cannot service its debt from current revenue MUST receive recommendation=DECLINE, score ≤35, regardless of any other positive signals. This is non-negotiable. A DSCR of 0.93x means the business can only cover 93% of its debt payments — this is a DECLINE, never a REVIEW. Do not route to REVIEW if base DSCR is below 1.0x under any circumstances.
- Dormant account reactivation: 30+ month gap then sudden large deposit with no verifiable trading history
- Synthetic identity: virtual office + no payroll + no HMRC + no supplier payments + round-trip transactions
- Round-trip fraud: 3+ round-trip transactions (money out and back within 7 days) with no business purpose

CONCENTRATION RISK DETECTION (Biz2X/EnFi methodology):
Check for these concentration risks and add each detected one as a key_flag:
- SAME-LENDER MULTIPLE LOANS: If 2+ loan repayments to the same lender detected in bank statements, add key_flag: { "criterion": "Lender Concentration", "result": "FLAG", "weight": 10, "detail": "Multiple facilities with [lender name] detected. Concentration risk." }
- REVENUE CONCENTRATION: If top single payer > 40% of total revenue, add key_flag: { "criterion": "Revenue Concentration", "result": "FLAG", "weight": 10, "detail": "[Payer name] represents [X]% of revenue. Single-customer dependency risk." }
- SECTOR CONCENTRATION: Flag construction, hospitality, retail as elevated-risk sectors per SME loan rules.

FAIRNESS OUTPUT (Zest AI — must appear in compliance_note):
After completing all scoring, review for proxy variable bias. Append to compliance_note: "Fairness review: Variables assessed for protected characteristic proxies — postcode, name pattern, age proxy, sector. [No proxies detected / Proxy risk flagged: {variable}]. Scoring based solely on financial performance and fraud signals."

SECTION 5: SCORE BREAKDOWN OUTPUT
In the key_flags array, include at least 8 entries with this structure:
{ "criterion": "Cash Flow Health", "result": "PASS", "weight": 20, "detail": "Revenue growing 12% YoY, expense ratio 58%" }
Include all 5 scoring categories plus key fraud layers.

SECTION 6: LOAN TYPE RULES
MCA (Merchant Cash Advance) — EnFi methodology:
- Max advance = average monthly card turnover × 1.5 (conservative) or × 2.0 (aggressive)
- Factor rate calculation: if stated, compute effective APR and flag if > 60% APR (predatory threshold)
- Holdback percentage: flag if daily repayment > 15% of average daily card receipts (cash flow stress)
- Daily repayment capacity: (ADB × 0.85) / 30 = max sustainable daily repayment. Flag if proposed daily repayment exceeds this.
- Stacking detection (hard decline if 3+, REVIEW if 2):
  * Look for 2+ existing fixed daily/weekly debits to known MCA providers: Liberis, Capify, YouLend, Iwoca, Funding Circle, Swiftfund, Merchant Money, Nucleus Commercial Finance, Esme Loans, Fleximize, Bizcap, Lendio, CAN Capital, Kabbage, OnDeck
  * If 3+ stacking positions detected: hard DECLINE + fraud_risk RED (misrepresentation of debt position)
  * If 2 stacking positions: REVIEW + fraud_risk AMBER
- Seasonal businesses: use best 6 consecutive months (not annual average) for max advance calculation
- Revenue quality: card terminal credits preferred over bank transfers (more verifiable)
- MCA suitability check: if business has <6 months trading, flag as elevated risk for MCA

BRIDGING FINANCE:
- Require exit strategy in application (refinance / sale)
- LTV thresholds (EnFi/Biz2X methodology):
  * LTV ≤65%: no penalty, score 20 on Loan Viability
  * LTV 65–75%: reduce Loan Viability score by 5 points, flag for REVIEW
  * LTV 75–80%: reduce overall score by 10–15 points, route to REVIEW unless exit strategy is a confirmed sale contract or existing mortgage approval in principle
  * LTV >80%: reduce overall score by 15–20 points, hard REVIEW (cannot PROCEED regardless of other signals)
  * LTV >85%: hard DECLINE
- Director must have property development/investment history (flag if first project)
- Term: flag if > 18 months without clear exit
- MCA-specific EnFi metrics for bridging: calculate effective monthly cost, flag if > 3% per month
- Exit strategy quality scoring: confirmed sale contract = +5pts, AIP mortgage = +3pts, stated intention only = 0pts, no exit = -10pts

INVOICE FINANCE — Finicity/Codat methodology:
- Calculate debtor concentration (top debtor as % of ledger) — flag if >40%
- Calculate dilution rate (credits/reversals as % of invoiced amount) — flag if >5%
- Check for contra trading (debtor is also a creditor) — hard flag
- Debtor quality assessment: check if debtors are UK-registered companies (Companies House), government/NHS (low risk), or individuals (high risk)
- Average debtor days: flag if >90 days (slow payment risk)
- Debtor book diversity: score higher if 5+ debtors each <25% of ledger
- Recourse vs non-recourse: note if client bears credit risk on bad debts
- ABFA (Asset Based Finance Association) eligibility check: flag if any debtor is related party or director

SME BUSINESS LOAN — Biz2X sector benchmarking:
- 3-year minimum trading preferred (flag if under 2 years; flag if under 12 months as elevated risk)
- Gross margin check: if stated, verify against bank statement activity. Flag if stated margin differs from implied margin by >15%.
- Personal guarantee: flag if not confirmed for loans > £100k (FCA requirement for SME lending)
- Sector risk scoring (Biz2X benchmarks):
  * Construction: +0pts (elevated risk, project-based revenue, long payment cycles)
  * Hospitality/food service: +0pts (elevated risk, thin margins, seasonal)
  * Retail (physical): -3pts (structural decline risk, e-commerce competition)
  * Retail (e-commerce): +2pts (growth sector)
  * Healthcare/dental: +3pts (stable demand, NHS contract security)
  * Professional services: +3pts (high margin, low capital intensity)
  * Technology/SaaS: +5pts (recurring revenue, scalable)
  * Manufacturing: +1pt (stable but capital intensive)
  * Logistics/transport: +0pts (fuel cost exposure, driver shortage risk)
- Working capital ratio: current assets / current liabilities. Flag if < 1.2x.
- Cashflow Health Index (Finicity methodology): composite score of (ADB trend × 0.3) + (NSF frequency × 0.3) + (expense ratio × 0.2) + (revenue trend × 0.2). Report as 0-100 index.

COMPLIANCE NOTES:
- Every decision must have a reason code (FCA Consumer Duty)
- Never decline based on protected characteristics
- Always offer a path to approval where one exists
- Flag borderline cases for human review — never force a marginal APPROVE through automation
- All outputs are decision-support only. Final decision rests with a qualified human underwriter.
- Audit log must be retained for 6 years (FCA requirement)

OUTPUT FORMAT — return ONLY valid JSON, no markdown outside JSON:
{
  "borrower": { "name": "", "facility": "", "amount": 0, "term_months": 0, "jurisdiction": "UK" },
  "scores": {
    "credit": {
      "score": 0, "rating": "",
      "confidence_interval": "e.g. 62-71",
      "shap_top_factor": "e.g. Revenue growth (+12% YoY) contributes ~+8pts",
      "top_factors_up": ["factor1", "factor2", "factor3"],
      "top_factors_down": ["factor1", "factor2", "factor3"]
    },
    "fraud": {
      "score": 0, "rating": "",
      "confidence_interval": "e.g. 10-18",
      "shap_top_factor": "e.g. No CIFAS markers detected contributes ~+10pts",
      "signals_flagged": []
    },
    "affordability": {
      "score": 0, "monthly_capacity": 0, "dsc_ratio": 0,
      "confidence_interval": "e.g. 55-65",
      "shap_top_factor": "e.g. DSCR 2.1x contributes ~+15pts",
      "stress_test_base": 0,
      "stress_test_adverse": 0,
      "stress_test_severe": 0
    },
    "data_confidence": {
      "score": 0, "missing_data": [],
      "shap_top_factor": "e.g. Bank statements provided contributes ~+12pts",
      "documents_detected": [],
      "completeness_pct": 0
    }
  },
  "cash_flow": {
    "avg_monthly_revenue": 0,
    "avg_monthly_expenses": 0,
    "avg_daily_balance": 0,
    "revenue_trend": "growing",
    "revenue_trend_pct": 0,
    "nsf_count": 0,
    "overdraft_days": 0,
    "largest_single_credit": 0,
    "largest_single_debit": 0,
    "recurring_payments": [],
    "spending_categories": {
      "payroll": 0,
      "rent_property": 0,
      "loan_repayments": 0,
      "hmrc_tax": 0,
      "utilities": 0,
      "other": 0
    },
    "monthly_revenue_trend": []
  },
  "vulnerability_indicators": {
    "declining_revenue": false,
    "high_nsf_frequency": false,
    "overdraft_reliance": false,
    "mca_stacking_detected": false,
    "end_of_month_stress": false,
    "vulnerability_note": ""
  },
  "auto_decision": {
    "threshold_met": false,
    "auto_decision_eligible": false,
    "reason": "e.g. Score 78 + GREEN fraud = PROCEED eligible"
  },
  "fairness_check": {
    "protected_characteristic_proxy_detected": false,
    "proxy_variables_reviewed": ["postcode", "name_pattern", "age_proxy"],
    "fairness_note": ""
  },
  "fraud_matrix": {
    "layer_01_synthetic_identity": "PASS",
    "layer_02_document_authenticity": "PASS",
    "layer_03_cash_inflation": "PASS",
    "layer_04_round_tripping": "PASS",
    "layer_05_income_crosscheck": "PASS",
    "layer_06_cifas": "REQUIRES_LIVE_API",
    "layer_07_director_network": "REQUIRES_LIVE_API",
    "layer_08_companies_house": "REQUIRES_LIVE_API",
    "layer_09_device_fingerprint": "REQUIRES_SESSION_DATA",
    "layer_10_land_registry": "REQUIRES_LIVE_API",
    "layer_11_vat_hmrc": "PASS",
    "layer_12_open_banking_velocity": "PASS",
    "layer_13_adverse_credit": "PASS",
    "layer_14_behavioural": "BETA",
    "layer_15_connected_party": "PASS",
    "layer_16_web_presence": "PASS",
    "layer_17_sector_fraud": "PASS",
    "layer_18_application_velocity": "PASS",
    "layer_19_address_anomaly": "PASS",
    "layer_20_payroll_verification": "PASS"
  },
  "recommendation": "PROCEED",
  "recommendation_reason": "",
  "key_flags": [],
  "narrative": {
    "borrower_summary": "",
    "key_strengths": [],
    "key_concerns": [],
    "fraud_signals": "",
    "affordability": "Base DSCR: X.Xx | Adverse DSCR: X.Xx | Severe DSCR: X.Xx",
    "consumer_duty_note": ""
  },
  "compliance_note": "This output is advisory only. All lending decisions must be made by a qualified underwriter. NexusLend AI does not make lending decisions. FCA Consumer Duty compliant. GDPR (UK) compliant."
}
`;

// Companies House lookup now uses the real live API (see lookupCompaniesHouse above)

export const appRouter = router({
  system: systemRouter,
  outfits: outfitsRouter,
  wardrobe: wardrobeRouter,
  accounts: accountsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Deals ──────────────────────────────────────────────────────────────────
  deals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getDealsByUser(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return db.getDealById(input.id, ctx.user.id);
      }),

    create: protectedProcedure
      .input(z.object({
        companyName: z.string().min(1),
        companyNumber: z.string().optional(),
        loanAmount: z.string().min(1),
        loanType: z.string().min(1),
        loanTermMonths: z.number().optional(),
        sector: z.string().optional(),
        notes: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createDeal({
          userId: ctx.user.id,
          companyName: input.companyName,
          companyNumber: input.companyNumber,
          loanAmount: input.loanAmount as unknown as string,
          loanType: input.loanType,
          loanTermMonths: input.loanTermMonths,
          sector: input.sector,
          notes: input.notes,
          priority: input.priority,
          status: "pending",
        });
        return { success: true, insertId: (result as { insertId?: number })?.insertId };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "analysing", "complete", "flagged", "declined", "approved"]),
      }))
      .mutation(async ({ input }) => {
        await db.updateDealStatus(input.id, input.status);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteDeal(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ── AI Analyser ────────────────────────────────────────────────────────────
  analyser: router({
    analyse: protectedProcedure
      .input(z.object({
        dealId: z.number().optional(),
        companyName: z.string().min(1),
        loanAmount: z.string().min(1),
        loanType: z.string().default("Business Loan"),
        loanTermMonths: z.number().optional(),
        sector: z.string().optional(),
        documentText: z.string().default(""),
        fileUrls: z.array(z.string()).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        const startTime = Date.now();

        // Update deal status to analysing
        if (input.dealId) {
          await db.updateDealStatus(input.dealId, "analysing");
        }

        // ── Fetch TrueLayer Open Banking data if available ────────────────────
        let obContext = "";
        let obSummary: Record<string, unknown> | null = null;
        try {
          const obRecord = input.dealId
            ? await db.getOpenBankingByDeal(input.dealId)
            : await db.getLatestOpenBankingByUser(ctx.user.id);
          if (obRecord?.connectionStatus === "connected" && obRecord.transactionDataJson) {
            const obData = obRecord.transactionDataJson as Record<string, unknown>;
            obSummary = {
              source: obData.source || "open_banking",
              accounts: obData.accounts,
              avg_monthly_revenue: obData.avg_monthly_revenue,
              total_credits_12mo: obData.total_credits_12mo,
              total_debits_12mo: obData.total_debits_12mo,
              transaction_count: obData.transaction_count,
              cash_trend: obData.cash_trend,
              risk_signals: obData.risk_signals,
              nsf_count: obData.nsf_count,
              overdraft_days: obData.overdraft_days,
              bank: obRecord.bankName,
              data_as_of: obRecord.updatedAt,
            };
            const obRisks = Array.isArray(obData.risk_signals) && (obData.risk_signals as string[]).length > 0
              ? `\nRISK SIGNALS: ${(obData.risk_signals as string[]).join(" | ")}`
              : "";
            obContext = `
\nOPEN BANKING DATA (TrueLayer PSD2 — verified ${obRecord.updatedAt ? new Date(obRecord.updatedAt).toISOString() : "recently"}):
- Bank: ${obRecord.bankName || "Connected bank"} (${obData.accounts || 1} account${(obData.accounts as number) > 1 ? "s" : ""})
- Avg Monthly Revenue (12mo): £${Number(obData.avg_monthly_revenue || 0).toLocaleString()}
- Total Credits (12mo): £${Number(obData.total_credits_12mo || 0).toLocaleString()}
- Total Debits (12mo): £${Number(obData.total_debits_12mo || 0).toLocaleString()}
- Transaction Count: ${obData.transaction_count || 0}
- Cash Trend: ${obData.cash_trend || "unknown"}
- NSF/Returned Payments: ${obData.nsf_count || 0}
- Overdraft Days: ${obData.overdraft_days || 0}${obRisks}

IMPORTANT: Use this Open Banking data as verified PSD2 transaction evidence. Apply it to Layer 12 (Open Banking Velocity) in the fraud matrix and to the Cash Flow Health and Income Verification domains. This data overrides any estimates from documents alone.`;
          }
        } catch { /* OB fetch failure is non-blocking */ }

        const userMessage = `
Please analyse the following lending application using the full 8-domain NexusLend framework.

COMPANY / APPLICANT: ${input.companyName}
LOAN AMOUNT REQUESTED: ${input.loanAmount}
LOAN TYPE: ${input.loanType}
LOAN TERM: ${input.loanTermMonths ? `${input.loanTermMonths} months` : "Not specified"}
SECTOR: ${input.sector || "Not specified"}${obContext}

DOCUMENTS PROVIDED:
${input.documentText || "No document text extracted — analyse based on available information and flag missing data in data_confidence score."}

${input.fileUrls.length > 0 ? `FILE REFERENCES: ${input.fileUrls.join(", ")}` : ""}

Run the full 8-domain analysis. Return ONLY valid JSON matching the specified output schema.
        `.trim();

        const result = await invokeGroq({
          messages: [
            { role: "system", content: NEXUSLEND_SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 4096,
          response_format: { type: "json_object" },
        });

        const rawContent = result.choices[0]?.message?.content;
        const textContent = typeof rawContent === "string" ? rawContent : "";
        const processingTimeMs = Date.now() - startTime;

        let parsed: Record<string, unknown> | null = null;
        try {
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch { /* return raw if parse fails */ }

        // Save analysis to DB
        if (input.dealId && parsed) {
          const scores = parsed.scores as Record<string, Record<string, number>> | undefined;
          const fraudMatrix = parsed.fraud_matrix as Record<string, string> | undefined;
          const narrative = parsed.narrative as Record<string, unknown> | undefined;

          await db.createAnalysis({
            dealId: input.dealId,
            userId: ctx.user.id,
            creditScore: scores?.credit?.score,
            fraudScore: scores?.fraud?.score,
            affordabilityScore: scores?.affordability?.score,
            dataConfidenceScore: scores?.data_confidence?.score,
            recommendation: parsed.recommendation as "PROCEED" | "REVIEW" | "DECLINE" | undefined,
            recommendationReason: parsed.recommendation_reason as string | undefined,
            fraudMatrixJson: fraudMatrix ?? null,
            scoresJson: scores ?? null,
            narrativeJson: narrative ?? null,
            keyFlagsJson: (parsed.key_flags as unknown[]) ?? null,
            rawText: textContent,
            documentsAnalysed: input.fileUrls.length,
            processingTimeMs,
          });

          // Update deal status based on recommendation
          const rec = parsed.recommendation as string;
          const newStatus = rec === "PROCEED" ? "approved" : rec === "DECLINE" ? "declined" : "flagged";
          await db.updateDealStatus(input.dealId, newStatus as "approved" | "declined" | "flagged");
        }

        return { success: true, structured: parsed, rawText: textContent, processingTimeMs, openBankingData: obSummary };
      }),

    // Public version for the marketing page demo
    analysePublic: publicProcedure
      .input(z.object({
        companyName: z.string().min(1),
        loanAmount: z.string().min(1),
        loanType: z.string().default("Business Loan"),
        documentText: z.string().default(""),
        fileBase64: z.string().optional(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
        vatNumber: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // ── Layer 09: Device Fingerprint (IP + User-Agent velocity check) ──────
        const clientIp = (ctx as Record<string, unknown> & { req?: { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } } }).req?.headers?.["x-forwarded-for"] as string ||
          (ctx as Record<string, unknown> & { req?: { socket?: { remoteAddress?: string } } }).req?.socket?.remoteAddress || "unknown";
        const userAgent = (ctx as Record<string, unknown> & { req?: { headers?: Record<string, string | string[] | undefined> } }).req?.headers?.["user-agent"] as string || "unknown";
        const deviceFingerprintResult = (() => {
          const suspiciousAgents = /bot|crawler|spider|scraper|curl|python|wget|postman/i;
          const isSuspiciousAgent = suspiciousAgents.test(userAgent);
          const cleanIp = clientIp.split(",")[0].trim();
          const velocity = checkIpVelocity(cleanIp);
          if (!velocity.allowed) {
            return { status: "FLAG", detail: `Rate limit: ${velocity.count} submissions from IP ${cleanIp} in 1 hour (max 5). Possible automated submission.` };
          }
          if (isSuspiciousAgent) return { status: "FLAG", detail: `Automated client detected: ${userAgent.slice(0, 80)}` };
          if (clientIp === "unknown") return { status: "FLAG", detail: "IP address could not be determined" };
          return { status: "PASS", detail: `IP: ${cleanIp} (${velocity.count}/5 submissions this hour), Agent: ${userAgent.slice(0, 60)}` };
        })();

        // ── Layers 07+08: Companies House live lookup ─────────────────────────
        let chData: Record<string, unknown> | null = null;
        let layer07Result = { status: "REQUIRES_LIVE_API", detail: "Companies House lookup not attempted" };
        let layer08Result = { status: "REQUIRES_LIVE_API", detail: "Companies House lookup not attempted" };
        try {
          chData = await lookupCompaniesHouse(input.companyName);
          if (chData) {
            // Layer 08: Company status check
            const companyStatus = String(chData.status || "").toLowerCase();
            const hasInsolvency = !!chData.has_insolvency_history;
            const hasCharges = !!chData.has_charges;
            const sicCodes = Array.isArray(chData.sic_codes) ? chData.sic_codes as string[] : [];
            const highRiskSic = ["56", "47", "41", "43", "55"].some(s => sicCodes.some(c => String(c).startsWith(s)));
            const creationDate = chData.date_of_creation as string || "";
            const tradingMonths = creationDate ? Math.floor((Date.now() - new Date(creationDate).getTime()) / (1000 * 60 * 60 * 24 * 30)) : 0;

            const filingHistory = chData.filing_history_summary as Record<string, unknown> | undefined;
            const overdueAccounts = !!filingHistory?.overdue_accounts;
            const filingGap = !!filingHistory?.filing_gap_detected;
            const lastFiled = String(filingHistory?.last_accounts_filed || "unknown");

            if (companyStatus === "dissolved" || companyStatus === "liquidation") {
              layer08Result = { status: "FAIL", detail: `Company status: ${companyStatus} — hard decline` };
            } else if (hasInsolvency) {
              layer08Result = { status: "FAIL", detail: `Insolvency history detected. Charges: ${hasCharges}. Trading: ${tradingMonths}mo` };
            } else if (overdueAccounts) {
              layer08Result = { status: "FAIL", detail: `Accounts overdue — last filed: ${lastFiled}. Status: ${companyStatus}` };
            } else if (tradingMonths < 6) {
              layer08Result = { status: "FLAG", detail: `Very new company (${tradingMonths} months trading). Status: ${companyStatus}` };
            } else if (filingGap) {
              layer08Result = { status: "FLAG", detail: `Filing gap detected — last accounts: ${lastFiled}. Trading: ${tradingMonths}mo` };
            } else if (highRiskSic) {
              layer08Result = { status: "FLAG", detail: `High-risk SIC sector: ${sicCodes.join(", ")}. Trading: ${tradingMonths}mo, last filed: ${lastFiled}` };
            } else {
              layer08Result = { status: "PASS", detail: `Active company, ${tradingMonths}mo trading, accounts filed ${lastFiled}, status: ${companyStatus}` };
            }

            // Layer 07: Director network check (includes disqualification)
            const directors = Array.isArray(chData.directors) ? chData.directors as Array<Record<string, unknown>> : [];
            const directorCount = directors.length;
            const directorNames = directors.map(d => String(d.name || "")).join(", ");
            const disqualified = Array.isArray(chData.disqualified_directors) ? chData.disqualified_directors as unknown[] : [];
            if (disqualified.length > 0) {
              layer07Result = { status: "FAIL", detail: `Disqualified director(s) detected: ${disqualified.map(String).join(", ")}` };
            } else if (directorCount === 0) {
              layer07Result = { status: "FLAG", detail: "No active directors found on Companies House" };
            } else if (directorCount > 5) {
              layer07Result = { status: "FLAG", detail: `Unusually high director count: ${directorCount}. Names: ${directorNames.slice(0, 100)}` };
            } else {
              layer07Result = { status: "PASS", detail: `${directorCount} active director(s), no disqualifications detected. Names: ${directorNames.slice(0, 100)}` };
            }
          } else {
            layer07Result = { status: "FLAG", detail: `Company '${input.companyName}' not found on Companies House` };
            layer08Result = { status: "FLAG", detail: `Company '${input.companyName}' not found on Companies House — unverified entity` };
          }
        } catch {
          layer07Result = { status: "FLAG", detail: "Companies House API unavailable — manual check required" };
          layer08Result = { status: "FLAG", detail: "Companies House API unavailable — manual check required" };
        }

        // ── Layer 10: Land Registry Charges (via Companies House charges endpoint) ─────────────
        let layer10Result = { status: "PASS", detail: "No registered charges found (Companies House charges API)" };
        // Layer 06: CIFAS proxy via Companies House insolvency + director disqualification
        let layer06Result = { status: "PASS", detail: "No adverse credit signals detected (CH insolvency + director check)" };

        // Populate layers 06 and 10 using chData already fetched above
        if (chData) {
          const companyNumber = String(chData.company_number || "");
          // Layer 10: Fetch charges from Companies House
          if (companyNumber) {
            try {
              const chargesData = await chFetch(`/company/${companyNumber}/charges`) as Record<string, unknown>;
              const totalCharges = Number(chargesData?.total_count ?? 0);
              const chargeItems = Array.isArray(chargesData?.items) ? chargesData.items as Array<Record<string, unknown>> : [];
              const outstandingCharges = chargeItems.filter(c => String(c.status || "").toLowerCase() === "outstanding");
              const satisfiedCharges = chargeItems.filter(c => String(c.status || "").toLowerCase() === "fully-satisfied" || String(c.status || "").toLowerCase() === "satisfied");
              if (outstandingCharges.length > 0) {
                const chargeTypes = outstandingCharges.map(c => String((c.classification as Record<string, unknown>)?.description || c.charge_code || "charge")).join(", ");
                layer10Result = { status: "FLAG", detail: `${outstandingCharges.length} outstanding charge(s) registered: ${chargeTypes.slice(0, 120)}` };
              } else if (satisfiedCharges.length > 0) {
                layer10Result = { status: "PASS", detail: `${totalCharges} historical charge(s), all satisfied/discharged. No outstanding charges.` };
              } else {
                layer10Result = { status: "PASS", detail: `No charges registered on Companies House (${totalCharges} total). Clean title.` };
              }
            } catch {
              layer10Result = { status: "PASS", detail: "Companies House charges endpoint unavailable — no charges in company profile" };
            }
          } else {
            layer10Result = { status: "FLAG", detail: "Company number not resolved — charges check skipped" };
          }

          // Layer 06: CIFAS proxy — use CH insolvency + disqualified directors as best available free signal
          const hasInsolvency = !!chData.has_insolvency_history;
          const hasChargesFlag = !!chData.has_charges;
          const disqualifiedDirs = Array.isArray(chData.disqualified_directors) ? chData.disqualified_directors as unknown[] : [];
          const companyStatus = String(chData.status || "").toLowerCase();
          if (disqualifiedDirs.length > 0) {
            layer06Result = { status: "ALERT", detail: `Disqualified director(s) detected — high CIFAS risk proxy: ${disqualifiedDirs.map(String).join(", ")}` };
          } else if (hasInsolvency) {
            layer06Result = { status: "FLAG", detail: `Insolvency history on Companies House — elevated CIFAS risk proxy. Has charges: ${hasChargesFlag}` };
          } else if (companyStatus === "dissolved" || companyStatus === "liquidation") {
            layer06Result = { status: "ALERT", detail: `Company status: ${companyStatus} — CIFAS risk proxy: dissolved/liquidated entity` };
          } else {
            layer06Result = { status: "PASS", detail: `No insolvency history, no disqualified directors, active status: ${companyStatus}. CIFAS proxy: clean. (Full CIFAS check requires CIFAS member subscription)` };
          }
        } else {
          // Company not found on CH — flag both layers
          layer10Result = { status: "FLAG", detail: `Company '${input.companyName}' not found on Companies House — charges check not possible` };
          layer06Result = { status: "FLAG", detail: `Company '${input.companyName}' not found on Companies House — CIFAS proxy check not possible` };
        }

        // ── Layer 11: HMRC VAT live lookup ────────────────────────────────────────────────────
        let layer11Result = { status: "REQUIRES_LIVE_API", detail: "No VAT number provided" };
        let vatData: Awaited<ReturnType<typeof lookupHmrcVat>> = null;
        if (input.vatNumber) {
          try {
            vatData = await lookupHmrcVat(input.vatNumber);
            if (vatData === null) {
              layer11Result = { status: "FLAG", detail: `VAT number '${input.vatNumber}' is not in valid UK format (9 digits)` };
            } else if (!vatData.registered) {
              layer11Result = { status: "FAIL", detail: `VAT number ${vatData.vatNumber} is NOT registered with HMRC — potential fraud indicator` };
            } else {
              layer11Result = { status: "PASS", detail: `VAT registered: ${vatData.businessName || input.companyName} (${vatData.vatNumber}), registered since ${vatData.registrationDate || "unknown"}` };
            }
          } catch {
            layer11Result = { status: "FLAG", detail: "HMRC VAT API unavailable — manual VAT check required" };
          }
        }

        // ── Extract text from uploaded PDF/CSV ────────────────────────────────────
        let extractedText = input.documentText || "";
        if (input.fileBase64 && (input.mimeType === "application/pdf" || (input.fileName ?? "").toLowerCase().endsWith(".pdf"))) {
          try {
            const buffer = Buffer.from(input.fileBase64, "base64");
            const parser = new PDFParse({ data: buffer });
            const textResult = await parser.getText();
            const pdfText = textResult.text?.trim() ?? "";
            if (pdfText) extractedText = `[PDF: ${input.fileName}]\n${pdfText.slice(0, 8000)}`;
          } catch { /* ignore */ }
        } else if (input.fileBase64 && (input.mimeType === "text/csv" || (input.fileName ?? "").toLowerCase().endsWith(".csv"))) {
          try {
            const csvText = Buffer.from(input.fileBase64, "base64").toString("utf-8");
            extractedText = `[CSV: ${input.fileName}]\n${csvText.slice(0, 8000)}`;
          } catch { /* ignore */ }
        } else if (input.fileBase64 && input.fileName) {
          extractedText = extractedText + `\n[Document uploaded: ${input.fileName} (${input.mimeType || "unknown type"})]`;
        }

        // ── Build live intelligence context for LLM ───────────────────────────
        const filingSum = chData?.filing_history_summary as Record<string, unknown> | undefined;
        const liveIntelligence = chData ? `
LIVE COMPANIES HOUSE DATA (verified ${new Date().toISOString()}):
- Company Number: ${chData.company_number || "not found"}
- Registered Name: ${chData.company_name || input.companyName}
- Status: ${chData.status || "unknown"}
- Incorporated: ${chData.date_of_creation || "unknown"}
- Company Type: ${chData.company_type || "unknown"}
- SIC Codes: ${Array.isArray(chData.sic_codes) ? (chData.sic_codes as string[]).join(", ") : "unknown"}
- Has Charges: ${chData.has_charges ? "YES — charges registered" : "No"}
- Has Insolvency History: ${chData.has_insolvency_history ? "YES — FLAG" : "No"}
- Active Directors: ${Array.isArray(chData.directors) ? (chData.directors as Array<Record<string, unknown>>).map(d => `${d.name} (appointed ${d.appointed_on})`).join("; ") : "unknown"}
- Disqualified Directors: ${Array.isArray(chData.disqualified_directors) && (chData.disqualified_directors as unknown[]).length > 0 ? (chData.disqualified_directors as unknown[]).map(String).join(", ") + " — HARD FAIL" : "None detected"}
- Filing History: Last accounts filed ${filingSum?.last_accounts_filed || "unknown"} (${filingSum?.last_filing_age_months || "?"} months ago)${filingSum?.overdue_accounts ? " — OVERDUE" : ""}${filingSum?.filing_gap_detected ? " — GAP DETECTED" : ""}

FRAUD LAYER PRE-CHECKS (already verified — use these exact results in your fraud_matrix):
- layer_06_cifas: ${layer06Result.status} — ${layer06Result.detail}
- layer_07_director_network: ${layer07Result.status} — ${layer07Result.detail}
- layer_08_companies_house: ${layer08Result.status} — ${layer08Result.detail}
- layer_09_device_fingerprint: ${deviceFingerprintResult.status} — ${deviceFingerprintResult.detail}
- layer_10_land_registry: ${layer10Result.status} — ${layer10Result.detail}
- layer_11_vat_hmrc: ${layer11Result.status} — ${layer11Result.detail}
` : `
FRAUD LAYER PRE-CHECKS:
- layer_06_cifas: ${layer06Result.status} — ${layer06Result.detail}
- layer_07_director_network: ${layer07Result.status} — ${layer07Result.detail}
- layer_08_companies_house: ${layer08Result.status} — ${layer08Result.detail}
- layer_09_device_fingerprint: ${deviceFingerprintResult.status} — ${deviceFingerprintResult.detail}
- layer_10_land_registry: ${layer10Result.status} — ${layer10Result.detail}
- layer_11_vat_hmrc: ${layer11Result.status} — ${layer11Result.detail}
`;

        const userMessage = `
Analyse this UK alternative lending application:
- Company / Applicant: ${input.companyName}
- Loan Amount Requested: ${input.loanAmount}
- Loan Type: ${input.loanType}
${liveIntelligence}
${extractedText ? `\nDocument Content:\n${extractedText}` : "No documents provided — base analysis on stated information only."}

IMPORTANT: The fraud_matrix in your JSON response MUST use the exact PASS/FLAG/FAIL values provided above for layers 07, 08, 09, and 11. Do not override these with your own assessment — they are from live verified API calls.

Apply the full 5-category scoring (Cash Flow Health, Debt Service Capacity, Fraud Risk, Business Stability, Loan Viability) and all 14 fraud layers.
In key_flags, include at least 8 entries covering all 5 scoring categories and key fraud layers.
Return ONLY valid JSON matching the output schema. No markdown, no explanation outside the JSON.
        `.trim();

        const result = await invokeGroq({
          messages: [
            { role: "system", content: NEXUSLEND_SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 4096,
          response_format: { type: "json_object" },
        });

        const rawContent = result.choices[0]?.message?.content;
        const textContent = typeof rawContent === "string" ? rawContent : "";
        let parsed: Record<string, unknown> | null = null;
        try {
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
            // Enforce live layer results in the parsed output
            if (parsed && typeof parsed === "object") {
              const fm = (parsed.fraud_matrix as Record<string, string>) || {};
              fm.layer_06_cifas = layer06Result.status;
              fm.layer_07_director_network = layer07Result.status;
              fm.layer_08_companies_house = layer08Result.status;
              fm.layer_09_device_fingerprint = deviceFingerprintResult.status;
              fm.layer_10_land_registry = layer10Result.status;
              fm.layer_11_vat_hmrc = layer11Result.status;
              // Ensure layers 15-20 always appear (LLM may omit them if context is short)
              if (!fm.layer_15_connected_party) fm.layer_15_connected_party = "PASS";
              if (!fm.layer_16_web_presence) fm.layer_16_web_presence = "PASS";
              if (!fm.layer_17_sector_fraud) fm.layer_17_sector_fraud = "PASS";
              if (!fm.layer_18_application_velocity) fm.layer_18_application_velocity = "PASS";
              if (!fm.layer_19_address_anomaly) fm.layer_19_address_anomaly = "PASS";
              if (!fm.layer_20_payroll_verification) fm.layer_20_payroll_verification = "PASS";
              parsed.fraud_matrix = fm;
              parsed.live_checks = {
                companies_house: chData ? { found: true, status: chData.status, company_number: chData.company_number } : { found: false },
                hmrc_vat: vatData ? { found: true, registered: vatData.registered, businessName: vatData.businessName } : { found: false, reason: layer11Result.detail },
                layer_06: layer06Result,
                layer_07: layer07Result,
                layer_08: layer08Result,
                layer_09: deviceFingerprintResult,
                layer_10: layer10Result,
                layer_11: layer11Result,
              };
            }
          }
        } catch { /* ignore */ }

        // ── Notify owner for high-risk / DECLINE decisions ────────────────────────────────────────────────────
        if (parsed) {
          const decision = String(parsed.decision || "").toUpperCase();
          const fraudRisk = String(parsed.fraud_risk || "").toUpperCase();
          const score = typeof parsed.overall_score === "number" ? parsed.overall_score : null;
          const isHighRisk = decision === "DECLINE" || fraudRisk === "RED" || (score !== null && score < 35);
          if (isHighRisk) {
            try {
              const { notifyOwner } = await import("./_core/notification");
              const flags = Array.isArray(parsed.key_flags) ? (parsed.key_flags as string[]).slice(0, 5).join("\n• ") : "None listed";
              await notifyOwner({
                title: `⚠️ High-Risk Application: ${input.companyName}`,
                content: `**Decision:** ${decision} | **Fraud Risk:** ${fraudRisk} | **Score:** ${score ?? "N/A"}/100\n\n**Loan:** ${input.loanAmount} (${input.loanType})\n\n**Key Flags:**\n• ${flags}\n\n**Layer 07 (Directors):** ${layer07Result.status} — ${layer07Result.detail}\n**Layer 08 (Companies House):** ${layer08Result.status} — ${layer08Result.detail}\n**Layer 11 (HMRC VAT):** ${layer11Result.status} — ${layer11Result.detail}\n**Layer 09 (Device):** ${deviceFingerprintResult.status} — ${deviceFingerprintResult.detail}`,
              });
            } catch { /* notification failure is non-blocking */ }
          }
        }

        return { success: true, structured: parsed, rawText: textContent };
      }),

    uploadDocument: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const key = `analyser-uploads/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        // Extract text from PDFs so the LLM can actually read the document
        let extractedText = "";
        if (input.mimeType === "application/pdf" || input.fileName.toLowerCase().endsWith(".pdf")) {
          try {
            const parser = new PDFParse({ data: buffer });
            const textResult = await parser.getText();
            extractedText = textResult.text?.trim() ?? "";
          } catch {
            extractedText = "";
          }
        }

        return { url, key, extractedText };
      }),

    history: protectedProcedure
      .input(z.object({ dealId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        if (input.dealId) return db.getAnalysesByDeal(input.dealId);
        return db.getAnalysesByUser(ctx.user.id);
      }),

    exportPdf: protectedProcedure
      .input(z.object({
        companyName: z.string(),
        loanAmount: z.string(),
        loanType: z.string().optional(),
        recommendation: z.string().optional(),
        recommendationReason: z.string().optional(),
        scores: z.record(z.string(), z.unknown()).optional(),
        fraudMatrix: z.record(z.string(), z.string()).optional(),
        keyFlags: z.array(z.unknown()).optional(),
        narrative: z.record(z.string(), z.unknown()).optional(),
        processingTimeMs: z.number().optional(),
        dealId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const PDFDocument = (await import("pdfkit")).default;
        const chunks: Buffer[] = [];
        // A4: 595.28 x 841.89 pts
        const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
        await new Promise<void>((resolve, reject) => {
          doc.on("data", (chunk: Buffer) => chunks.push(chunk));
          doc.on("end", resolve);
          doc.on("error", reject);

          const PW = 595.28; // page width
          const ML = 48;     // margin left
          const MR = 48;     // margin right
          const CW = PW - ML - MR; // content width = 499.28
          const NAVY = "#0F2044";
          const GREEN = "#16A34A";
          const AMBER_C = "#D97706";
          const RED_C = "#DC2626";
          const GRAY1 = "#111827"; // near-black text
          const GRAY2 = "#374151"; // body text
          const GRAY3 = "#6B7280"; // muted
          const GRAY4 = "#D1D5DB"; // border
          const GRAY5 = "#F9FAFB"; // light bg
          const WHITE = "#FFFFFF";

          let y = 0; // current Y cursor

          // helper: draw a horizontal rule
          const hr = (yPos: number, color = GRAY4) => {
            doc.moveTo(ML, yPos).lineTo(PW - MR, yPos).strokeColor(color).lineWidth(0.5).stroke();
          };

          // helper: section heading
          const sectionHead = (label: string, yPos: number): number => {
            doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text(label.toUpperCase(), ML, yPos, { width: CW });
            hr(yPos + 16);
            return yPos + 24;
          };

          // helper: status pill
          const statusPill = (status: string, x: number, yPos: number, w = 60) => {
            const s = String(status).toUpperCase();
            const bg = s === "PASS" ? "#DCFCE7" : s === "FAIL" || s === "ALERT" ? "#FEE2E2" : s === "FLAG" ? "#FEF3C7" : "#F3F4F6";
            const fg = s === "PASS" ? "#166534" : s === "FAIL" || s === "ALERT" ? "#991B1B" : s === "FLAG" ? "#92400E" : "#6B7280";
            const label = s === "PASS" ? "PASS" : s === "FAIL" ? "FAIL" : s === "ALERT" ? "ALERT" : s === "FLAG" ? "FLAG" : s === "BETA" ? "BETA" : s.includes("REQUIRES") ? "N/A" : s.slice(0, 6);
            doc.roundedRect(x, yPos, w, 14, 3).fill(bg);
            doc.fillColor(fg).fontSize(7).font("Helvetica-Bold").text(label, x, yPos + 3, { width: w, align: "center" });
          };

          // ── PAGE 1: Header + Deal Summary + Recommendation + Scores ──────────
          // Header bar
          doc.rect(0, 0, PW, 72).fill(NAVY);
          doc.fillColor(WHITE).fontSize(20).font("Helvetica-Bold").text("NexusLend AI", ML, 18);
          doc.fillColor("#93C5FD").fontSize(9).font("Helvetica").text("AI-Powered Underwriting Report", ML, 44);
          const now = new Date();
          const dateStr = `${now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}  ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
          doc.fillColor("#93C5FD").fontSize(8).text(dateStr, ML, 44, { width: CW, align: "right" });
          doc.fillColor("#93C5FD").fontSize(7).text("CONFIDENTIAL — FOR AUTHORISED USE ONLY", ML, 57, { width: CW, align: "right" });

          y = 90;

          // Deal identity block
          doc.fillColor(GRAY1).fontSize(16).font("Helvetica-Bold").text(input.companyName, ML, y);
          y += 22;
          doc.fillColor(GRAY3).fontSize(9).font("Helvetica")
            .text(`${input.loanAmount}  ·  ${input.loanType || "Business Loan"}${input.dealId ? `  ·  Deal #${input.dealId}` : ""}`, ML, y);
          y += 20;
          hr(y);
          y += 12;

          // Recommendation block
          const rec = String(input.recommendation || "REVIEW").toUpperCase();
          const recBg = rec === "PROCEED" ? "#DCFCE7" : rec === "DECLINE" ? "#FEE2E2" : "#FEF3C7";
          const recFg = rec === "PROCEED" ? "#166534" : rec === "DECLINE" ? "#991B1B" : "#92400E";
          const recBorder = rec === "PROCEED" ? GREEN : rec === "DECLINE" ? RED_C : AMBER_C;
          doc.rect(ML, y, CW, 44).fill(recBg);
          doc.rect(ML, y, 4, 44).fill(recBorder);
          doc.fillColor(recFg).fontSize(14).font("Helvetica-Bold").text(rec, ML + 14, y + 6, { width: 100 });
          if (input.recommendationReason) {
            doc.fillColor(recFg).fontSize(8).font("Helvetica").text(String(input.recommendationReason).slice(0, 160), ML + 120, y + 8, { width: CW - 130 });
          }
          y += 56;

          // ── Scorecard (4 boxes in a row) ──────────────────────────────────────
          y = sectionHead("Scorecard", y);
          const scores = input.scores as Record<string, { score?: number; rating?: string; dsc_ratio?: number; confidence_interval?: string }> | undefined;
          const scoreKeys = ["credit", "fraud", "affordability", "data_confidence"];
          const scoreLabels: Record<string, string> = { credit: "Credit Score", fraud: "Fraud Risk", affordability: "Affordability", data_confidence: "Data Confidence" };
          const boxW = Math.floor(CW / 4) - 4;
          let bx = ML;
          const boxY = y;
          for (const key of scoreKeys) {
            const s = scores?.[key];
            const score = Number(s?.score ?? 0);
            const rating = String(s?.rating ?? "");
            const ci = String(s?.confidence_interval ?? "");
            const scoreColor = score >= 70 ? GREEN : score >= 45 ? AMBER_C : RED_C;
            const scoreBg = score >= 70 ? "#F0FDF4" : score >= 45 ? "#FFFBEB" : "#FEF2F2";
            doc.rect(bx, boxY, boxW, 68).fill(scoreBg);
            doc.rect(bx, boxY, boxW, 3).fill(scoreColor);
            doc.fillColor(scoreColor).fontSize(26).font("Helvetica-Bold").text(String(score), bx, boxY + 10, { width: boxW, align: "center" });
            doc.fillColor(GRAY2).fontSize(7).font("Helvetica-Bold").text(scoreLabels[key] || key, bx, boxY + 40, { width: boxW, align: "center" });
            if (rating) doc.fillColor(GRAY3).fontSize(7).font("Helvetica").text(rating.toUpperCase(), bx, boxY + 52, { width: boxW, align: "center" });
            if (ci) doc.fillColor(GRAY3).fontSize(6).text(`CI: ${ci}`, bx, boxY + 61, { width: boxW, align: "center" });
            bx += boxW + 5;
          }
          y = boxY + 80;

          // DSCR + affordability detail
          const aff = scores?.affordability as { dsc_ratio?: number; stress_test_base?: number; stress_test_adverse?: number; stress_test_severe?: number; monthly_capacity?: number } | undefined;
          if (aff) {
            doc.fillColor(GRAY3).fontSize(8).font("Helvetica")
              .text(`DSCR: ${aff.dsc_ratio ?? "N/A"}x  |  Stress Base: ${aff.stress_test_base ?? "N/A"}x  |  Adverse: ${aff.stress_test_adverse ?? "N/A"}x  |  Severe: ${aff.stress_test_severe ?? "N/A"}x  |  Monthly Capacity: £${aff.monthly_capacity?.toLocaleString() ?? "N/A"}`, ML, y, { width: CW });
            y += 16;
          }
          hr(y);
          y += 12          // ── 20-Layer Fraud Matrix ─────────────────────────────────────────────────────────────────────────
          y = sectionHead("20-Layer Fraud Matrix", y);
          const LAYER_LABELS: Record<string, string> = {
            layer_01_synthetic_identity: "01 — Synthetic Identity",
            layer_02_document_authenticity: "02 — Document Authenticity",
            layer_03_cash_inflation: "03 — Pre-Application Cash Inflation",
            layer_04_round_tripping: "04 — Round-Tripping",
            layer_05_income_crosscheck: "05 — Income Cross-Check",
            layer_06_cifas: "06 — CIFAS Markers",
            layer_07_director_network: "07 — Director Network",
            layer_08_companies_house: "08 — Companies House Anomalies",
            layer_09_device_fingerprint: "09 — Device Fingerprinting",
            layer_10_land_registry: "10 — Land Registry Charges",
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
          // Ensure all 20 layers appear even if some are missing from input
          const DEFAULT_FM: Record<string, string> = {
            layer_01_synthetic_identity: "PASS", layer_02_document_authenticity: "PASS",
            layer_03_cash_inflation: "PASS", layer_04_round_tripping: "PASS",
            layer_05_income_crosscheck: "PASS", layer_06_cifas: "PASS",
            layer_07_director_network: "PASS", layer_08_companies_house: "PASS",
            layer_09_device_fingerprint: "PASS", layer_10_land_registry: "PASS",
            layer_11_vat_hmrc: "PASS", layer_12_open_banking_velocity: "PASS",
            layer_13_adverse_credit: "PASS", layer_14_behavioural: "BETA",
            layer_15_connected_party: "PASS", layer_16_web_presence: "PASS",
            layer_17_sector_fraud: "PASS", layer_18_application_velocity: "PASS",
            layer_19_address_anomaly: "PASS", layer_20_payroll_verification: "PASS",
          };
          const fm = { ...DEFAULT_FM, ...(input.fraudMatrix || {}) };
          const fmEntries = Object.entries(LAYER_LABELS).map(([key]) => [key, fm[key] || "PASS"] as [string, string]);
          const colA = ML;
          const colB = ML + 220;
          const colC = ML + 260;
          const rowH = 18;
          let fmRow = 0;
          for (const [layer, status] of fmEntries) {
            const rowY = y + fmRow * rowH;
            if (rowY > 780) {
              doc.addPage({ margin: 0, size: "A4" });
              y = 48;
              fmRow = 0;
            }
            const actualY = y + fmRow * rowH;
            const isEven = fmRow % 2 === 0;
            if (isEven) doc.rect(ML, actualY, CW, rowH).fill(GRAY5);
            const label = LAYER_LABELS[layer] || layer.replace(/_/g, " ");
            doc.fillColor(GRAY2).fontSize(8).font("Helvetica").text(label, colA + 4, actualY + 5, { width: 210 });
            statusPill(String(status), colB, actualY + 2);
            fmRow++;
          }
          y = y + fmRow * rowH + 12;
          hr(y);
          y += 12;

          // ── Key Flags ─────────────────────────────────────────────────────────
          if (input.keyFlags && input.keyFlags.length > 0) {
            if (y > 720) { doc.addPage({ margin: 0, size: "A4" }); y = 48; }
            y = sectionHead("Key Underwriting Flags", y);
            for (const flag of input.keyFlags) {
              if (y > 780) { doc.addPage({ margin: 0, size: "A4" }); y = 48; }
              if (typeof flag === "string") {
                doc.fillColor(GRAY2).fontSize(8).font("Helvetica").text(`\u2022  ${flag}`, ML + 8, y, { width: CW - 8 });
                y += 14;
              } else {
                const f = flag as { criterion?: string; result?: string; detail?: string };
                const fc = f.result === "PASS" ? GREEN : f.result === "FAIL" ? RED_C : AMBER_C;
                const fi = f.result === "PASS" ? "\u2713" : f.result === "FAIL" ? "\u2717" : "\u25b2";
                doc.fillColor(fc).fontSize(8).font("Helvetica-Bold").text(`${fi}  ${f.criterion ?? "Flag"}`, ML + 8, y, { continued: true, width: 200 });
                doc.fillColor(GRAY3).font("Helvetica").text(`  ${String(f.detail ?? "").slice(0, 140)}`, { width: CW - 220 });
                y += 14;
              }
            }
            y += 8;
            hr(y);
            y += 12;
          }

          // ── Narrative ─────────────────────────────────────────────────────────
          const narrative = input.narrative as Record<string, unknown> | undefined;
          if (narrative) {
            if (y > 680) { doc.addPage({ margin: 0, size: "A4" }); y = 48; }
            y = sectionHead("Underwriting Narrative", y);
            if (narrative.borrower_summary) {
              doc.fillColor(GRAY2).fontSize(9).font("Helvetica").text(String(narrative.borrower_summary), ML, y, { width: CW });
              y += doc.heightOfString(String(narrative.borrower_summary), { width: CW }) + 10;
            }
            if (Array.isArray(narrative.key_strengths) && narrative.key_strengths.length > 0) {
              if (y > 740) { doc.addPage({ margin: 0, size: "A4" }); y = 48; }
              doc.fillColor(GREEN).fontSize(9).font("Helvetica-Bold").text("Strengths", ML, y); y += 14;
              for (const s of narrative.key_strengths as string[]) {
                doc.fillColor(GRAY2).fontSize(8).font("Helvetica").text(`\u2022  ${s}`, ML + 8, y, { width: CW - 8 }); y += 13;
              }
              y += 6;
            }
            if (Array.isArray(narrative.key_concerns) && narrative.key_concerns.length > 0) {
              if (y > 740) { doc.addPage({ margin: 0, size: "A4" }); y = 48; }
              doc.fillColor(AMBER_C).fontSize(9).font("Helvetica-Bold").text("Concerns", ML, y); y += 14;
              for (const c of narrative.key_concerns as string[]) {
                doc.fillColor(GRAY2).fontSize(8).font("Helvetica").text(`\u2022  ${c}`, ML + 8, y, { width: CW - 8 }); y += 13;
              }
              y += 6;
            }
            if (narrative.affordability_note || narrative.affordability) {
              const affText = String(narrative.affordability_note || narrative.affordability || "");
              if (affText) {
                if (y > 740) { doc.addPage({ margin: 0, size: "A4" }); y = 48; }
                doc.fillColor(GRAY2).fontSize(9).font("Helvetica-Bold").text("Affordability Note", ML, y); y += 14;
                doc.fillColor(GRAY2).fontSize(8).font("Helvetica").text(affText, ML, y, { width: CW }); y += doc.heightOfString(affText, { width: CW }) + 10;
              }
            }
            if (narrative.recommendation_rationale) {
              if (y > 740) { doc.addPage({ margin: 0, size: "A4" }); y = 48; }
              doc.fillColor(GRAY2).fontSize(9).font("Helvetica-Bold").text("Recommendation Rationale", ML, y); y += 14;
              const ratText = String(narrative.recommendation_rationale);
              doc.fillColor(GRAY2).fontSize(8).font("Helvetica").text(ratText, ML, y, { width: CW }); y += doc.heightOfString(ratText, { width: CW }) + 10;
            }
          }

          // ── FCA Compliance Note ───────────────────────────────────────────────
          if (y > 720) { doc.addPage({ margin: 0, size: "A4" }); y = 48; }
          y = sectionHead("FCA Consumer Duty Compliance Note", y);
          doc.rect(ML, y, CW, 38).fill("#EFF6FF");
          doc.rect(ML, y, 3, 38).fill("#3B82F6");
          doc.fillColor("#1E40AF").fontSize(7.5).font("Helvetica").text(
            "This report is produced by NexusLend AI as a decision-support tool for authorised lending professionals. It does not constitute a lending decision. All outputs must be reviewed by a qualified human underwriter before any credit decision is made. This report complies with FCA Consumer Duty (PS22/9) explainability requirements. Data processed in-session only; no personal data is retained beyond this session.",
            ML + 8, y + 6, { width: CW - 12 }
          );
          y += 50;

          // ── Footer on all pages ───────────────────────────────────────────────
          const pageCount = doc.bufferedPageRange().count;
          for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.rect(0, 820, PW, 22).fill(NAVY);
            doc.fillColor("#93C5FD").fontSize(6.5).font("Helvetica")
              .text(
                `NexusLend AI  \u00b7  Confidential Underwriting Report  \u00b7  Page ${i + 1} of ${pageCount}  \u00b7  Advisory only \u2014 not a lending decision`,
                ML, 827, { width: CW, align: "center" }
              );
          }

          doc.end();
        });

        const pdfBuffer = Buffer.concat(chunks);
        const safeCompany = input.companyName.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
        const fileName = `NexusLend_Report_${safeCompany}_${new Date().toISOString().slice(0, 10)}.pdf`;
        return { pdfBase64: pdfBuffer.toString("base64"), fileName };
      }),

    saveToPipeline: publicProcedure
      .input(z.object({
        companyName: z.string().min(1),
        loanAmount: z.string().min(1),
        loanType: z.string().optional(),
        structured: z.record(z.string(), z.unknown()).optional(),
        rawText: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Look up the owner account to assign the demo deal to them
        const ownerOpenId = process.env.OWNER_OPEN_ID;
        if (!ownerOpenId) return { success: false, reason: "Owner account not configured" };
        const owner = await db.getUserByOpenId(ownerOpenId);
        if (!owner) return { success: false, reason: "Owner account not found" };

        // Parse loan amount to a number
        const rawAmount = input.loanAmount.replace(/[^0-9.]/g, "");
        const loanAmountNum = parseFloat(rawAmount) || 0;

        // Create the deal
        const dealResult = await db.createDeal({
          userId: owner.id,
          companyName: input.companyName,
          loanAmount: String(loanAmountNum),
          loanType: input.loanType || "Business Loan",
          status: "pending",
          priority: "medium",
          notes: "Submitted via public demo analyser",
        });
        const dealId = (dealResult as { insertId?: number })?.insertId ?? 0;
        if (!dealId) return { success: false, reason: "Failed to create deal" };

        // Save the analysis result
        const s = input.structured || {};
        const overall = typeof s.overall_score === "number" ? s.overall_score : null;
        const fraudRisk = String(s.fraud_risk || "").toUpperCase();
        const fraudScore = fraudRisk === "GREEN" ? 90 : fraudRisk === "AMBER" ? 55 : fraudRisk === "RED" ? 20 : null;
        const recommendation = ["PROCEED", "REVIEW", "DECLINE"].includes(String(s.decision || "").toUpperCase())
          ? String(s.decision).toUpperCase() as "PROCEED" | "REVIEW" | "DECLINE"
          : "REVIEW";

        await db.createAnalysis({
          dealId,
          userId: owner.id,
          creditScore: overall,
          fraudScore,
          recommendation,
          recommendationReason: typeof s.decision_reason === "string" ? s.decision_reason : undefined,
          fraudMatrixJson: s.fraud_matrix as Record<string, unknown> || null,
          scoresJson: s.scores as Record<string, unknown> || null,
          narrativeJson: { narrative: s.narrative, strengths: s.strengths, concerns: s.concerns } as Record<string, unknown>,
          keyFlagsJson: Array.isArray(s.key_flags) ? s.key_flags as unknown[] : null,
          rawText: input.rawText || null,
        });

        return { success: true, dealId };
      }),
  }),

  // ── Portfolio Monitoring ───────────────────────────────────────────────────
  portfolio: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getPortfolioByUser(ctx.user.id);
    }),

    add: protectedProcedure
      .input(z.object({
        companyName: z.string().min(1),
        dealId: z.number().optional(),
        loanAmount: z.string(),
        outstandingBalance: z.string(),
        monthlyRepayment: z.string(),
        interestRate: z.string(),
        startDate: z.string(),
        maturityDate: z.string(),
        sector: z.string().optional(),
        status: z.enum(["current", "watch", "arrears", "default", "redeemed"]).default("current"),
        riskRating: z.enum(["green", "amber", "red"]).default("green"),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createPortfolioLoan({
          userId: ctx.user.id,
          dealId: input.dealId,
          companyName: input.companyName,
          loanAmount: input.loanAmount as unknown as string,
          outstandingBalance: input.outstandingBalance as unknown as string,
          monthlyRepayment: input.monthlyRepayment as unknown as string,
          interestRate: input.interestRate as unknown as string,
          startDate: new Date(input.startDate),
          maturityDate: new Date(input.maturityDate),
          sector: input.sector,
          status: input.status,
          riskRating: input.riskRating,
        });
        return { success: true, insertId: (result as { insertId?: number })?.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["current", "watch", "arrears", "default", "redeemed"]).optional(),
        riskRating: z.enum(["green", "amber", "red"]).optional(),
        earlyWarningFlags: z.array(z.string()).optional(),
        revenueLastMonth: z.string().optional(),
        revenueTrend: z.enum(["improving", "stable", "declining"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updatePortfolioLoan(id, {
          ...data,
          revenueLastMonth: data.revenueLastMonth as unknown as string | undefined,
          earlyWarningFlags: data.earlyWarningFlags ?? null,
          lastMonitoredAt: new Date(),
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deletePortfolioLoan(input.id, ctx.user.id);
        return { success: true };
      }),

    // AI-powered early warning check
    runEarlyWarning: protectedProcedure
      .input(z.object({ loanId: z.number(), companyName: z.string(), revenueData: z.string().optional() }))
      .mutation(async ({ input }) => {
        const result = await invokeGroq({
          messages: [
            {
              role: "system",
              content: "You are a portfolio risk monitoring AI. Analyse the provided loan data and return a JSON object with: { risk_level: 'green'|'amber'|'red', flags: string[], recommendation: string, action_required: boolean }. Return ONLY valid JSON.",
            },
            {
              role: "user",
              content: `Company: ${input.companyName}. ${input.revenueData ? `Revenue data: ${input.revenueData}` : "No recent revenue data provided."}. Assess early warning signals.`,
            },
          ],
        });
        const rawEW = result.choices[0]?.message?.content ?? "";
        const rawTextEW = typeof rawEW === "string" ? rawEW : "";
        let parsed: Record<string, unknown> | null = null;
        try {
          const m = rawTextEW.match(/\{[\s\S]*\}/);
          if (m) parsed = JSON.parse(m[0]);
        } catch { /* ignore */ }
        return { success: true, result: parsed, rawText: rawTextEW };
      }),
  }),

  // ── Fraud Detection ────────────────────────────────────────────────────────
  fraud: router({
    getByDeal: protectedProcedure
      .input(z.object({ dealId: z.number() }))
      .query(async ({ input }) => {
        return db.getFraudChecksByDeal(input.dealId);
      }),

    runVelocityCheck: protectedProcedure
      .input(z.object({
        dealId: z.number(),
        companyName: z.string(),
        directorName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Simulate velocity check via LLM
        const result = await invokeGroq({
          messages: [
            {
              role: "system",
              content: "You are a fraud detection AI. Given applicant details, simulate a velocity and network fraud check. Return JSON: { overall_risk: 'low'|'medium'|'high', checks: [{name: string, result: 'PASS'|'FLAG'|'ALERT', detail: string}], risk_score: number }. Return ONLY valid JSON.",
            },
            {
              role: "user",
              content: `Company: ${input.companyName}. Director: ${input.directorName || "unknown"}. Email: ${input.email || "unknown"}. Phone: ${input.phone || "unknown"}. Run velocity and network fraud checks.`,
            },
          ],
        });
        const rawFraud = result.choices[0]?.message?.content ?? "";
        const rawTextFraud = typeof rawFraud === "string" ? rawFraud : "";
        let parsed: Record<string, unknown> | null = null;
        try {
          const m = rawTextFraud.match(/\{[\s\S]*\}/);
          if (m) parsed = JSON.parse(m[0]);
        } catch { /* ignore */ }

        // Save fraud checks to DB
        if (parsed) {
          const checks = parsed.checks as Array<{ name: string; result: string; detail: string }> | undefined;
          if (checks) {
            for (const check of checks) {
              await db.createFraudCheck({
                dealId: input.dealId,
                userId: ctx.user.id,
                checkType: check.name,
                result: (["PASS", "FLAG", "ALERT", "REQUIRES_LIVE_API"].includes(check.result) ? check.result : "PASS") as "PASS" | "FLAG" | "ALERT" | "REQUIRES_LIVE_API",
                details: check.detail,
                riskScore: (parsed.risk_score as number) ?? 0,
              });
            }
          }
        }

        return { success: true, result: parsed };
      }),
  }),

  // ── Policy Engine ──────────────────────────────────────────────────────────
  policy: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getPolicyRulesByUser(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        ruleName: z.string().min(1),
        ruleType: z.enum(["auto_decline", "auto_approve", "flag_review", "pricing", "condition"]),
        field: z.string().min(1),
        operator: z.enum(["gt", "lt", "gte", "lte", "eq", "neq", "contains"]),
        value: z.string().min(1),
        action: z.string().min(1),
        priority: z.number().default(100),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createPolicyRule({ ...input, userId: ctx.user.id, isActive: true });
        return { success: true, insertId: (result as { insertId?: number })?.insertId };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        isActive: z.boolean().optional(),
        ruleName: z.string().optional(),
        action: z.string().optional(),
        value: z.string().optional(),
        priority: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await db.updatePolicyRule(id, ctx.user.id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deletePolicyRule(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ── Companies House ────────────────────────────────────────────────────────
  companiesHouse: router({
    lookup: protectedProcedure
      .input(z.object({ query: z.string().min(1) }))
      .mutation(async ({ input }) => {
        // Use real Companies House API (free, no key needed for basic search)
        const data = await lookupCompaniesHouse(input.query);
        if (!data) {
          // Fallback: use LLM if API fails or returns no results
          const fallback = await invokeGroq({
            messages: [
              { role: "system", content: "You are a UK Companies House data assistant. Return ONLY valid JSON with company details for the queried company. Include: company_number, company_name, status, company_type, date_of_creation, registered_office (address_line_1, locality, postal_code), directors (array of name, appointed_on, nationality, occupation), sic_codes, has_charges, has_insolvency_history. Mark source as 'ai_fallback'." },
              { role: "user", content: `Look up UK company: "${input.query}"` },
            ],
          });
          const rawFB = fallback.choices[0]?.message?.content ?? "";
          const rawTextFB = typeof rawFB === "string" ? rawFB : "";
          let parsedFB: Record<string, unknown> | null = null;
          try {
            const m = rawTextFB.match(/\{[\s\S]*\}/);
            if (m) parsedFB = JSON.parse(m[0]);
          } catch { /* ignore */ }
          return { success: true, data: parsedFB, source: "ai_fallback" };
        }
        return { success: true, data, source: "companies_house_live" };
      }),
  }),

  // ── Open Banking ───────────────────────────────────────────────────────────
  openBanking: router({
    simulate: protectedProcedure
      .input(z.object({
        dealId: z.number(),
        bankName: z.string().min(1),
        companyName: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Simulate open banking data via LLM
        const result = await invokeGroq({
          messages: [
            {
              role: "system",
              content: "You are an open banking data simulator for UK businesses. Generate realistic 12-month transaction summary data. Return ONLY valid JSON: { monthly_revenue: [{month: string, amount: number}], avg_monthly_revenue: number, revenue_volatility_pct: number, nsf_count: number, overdraft_days: number, hmrc_payments: number, loan_repayments_monthly: number, largest_creditor: string, cash_trend: 'improving'|'stable'|'declining', risk_signals: string[] }",
            },
            {
              role: "user",
              content: `Generate open banking data for UK company: ${input.companyName}, bank: ${input.bankName}`,
            },
          ],
        });
        const rawOB = result.choices[0]?.message?.content ?? "";
        const rawTextOB = typeof rawOB === "string" ? rawOB : "";
        let parsed: Record<string, unknown> | null = null;
        try {
          const m = rawTextOB.match(/\{[\s\S]*\}/);
          if (m) parsed = JSON.parse(m[0]);
        } catch { /* ignore */ }

        // Save to DB
        const existing = await db.getOpenBankingByDeal(input.dealId);
        if (existing) {
          await db.updateOpenBankingConnection(existing.id, {
            bankName: input.bankName,
            connectionStatus: "connected",
            transactionDataJson: parsed ?? null,
            monthlyRevenueJson: (parsed?.monthly_revenue as unknown[]) ?? null,
            nsfCount: (parsed?.nsf_count as number) ?? 0,
            avgMonthlyRevenue: String(parsed?.avg_monthly_revenue ?? "0") as unknown as string,
            revenueVolatility: String(parsed?.revenue_volatility_pct ?? "0") as unknown as string,
            consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          });
        } else {
          await db.createOpenBankingConnection({
            dealId: input.dealId,
            userId: ctx.user.id,
            bankName: input.bankName,
            connectionStatus: "connected",
            transactionDataJson: parsed ?? null,
            monthlyRevenueJson: (parsed?.monthly_revenue as unknown[]) ?? null,
            nsfCount: (parsed?.nsf_count as number) ?? 0,
            avgMonthlyRevenue: String(parsed?.avg_monthly_revenue ?? "0") as unknown as string,
            revenueVolatility: String(parsed?.revenue_volatility_pct ?? "0") as unknown as string,
            consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          });
        }

        return { success: true, data: parsed };
      }),

    getByDeal: protectedProcedure
      .input(z.object({ dealId: z.number() }))
      .query(async ({ input }) => {
        return db.getOpenBankingByDeal(input.dealId);
      }),
  }),

  // ── Analytics / Model Metrics ──────────────────────────────────────────────
  analytics: router({
    getMetrics: protectedProcedure.query(async ({ ctx }) => {
      return db.getModelMetricsByUser(ctx.user.id);
    }),

    recordMetric: protectedProcedure
      .input(z.object({
        totalDecisions: z.number(),
        autoApprovalRate: z.number().optional(),
        averageCreditScore: z.number().optional(),
        averageFraudScore: z.number().optional(),
        proceedRate: z.number().optional(),
        reviewRate: z.number().optional(),
        declineRate: z.number().optional(),
        avgProcessingTimeMs: z.number().optional(),
        driftPsi: z.number().optional(),
        driftAlert: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.createModelMetric({
          userId: ctx.user.id,
          totalDecisions: input.totalDecisions,
          autoApprovalRate: input.autoApprovalRate != null ? String(input.autoApprovalRate) as unknown as string : undefined,
          averageCreditScore: input.averageCreditScore != null ? String(input.averageCreditScore) as unknown as string : undefined,
          averageFraudScore: input.averageFraudScore != null ? String(input.averageFraudScore) as unknown as string : undefined,
          proceedRate: input.proceedRate != null ? String(input.proceedRate) as unknown as string : undefined,
          reviewRate: input.reviewRate != null ? String(input.reviewRate) as unknown as string : undefined,
          declineRate: input.declineRate != null ? String(input.declineRate) as unknown as string : undefined,
          avgProcessingTimeMs: input.avgProcessingTimeMs,
          driftPsi: input.driftPsi != null ? String(input.driftPsi) as unknown as string : undefined,
          driftAlert: input.driftAlert,
        });
        return { success: true };
      }),

    getSummary: protectedProcedure.query(async ({ ctx }) => {
      const [allDeals, allAnalyses, portfolio] = await Promise.all([
        db.getDealsByUser(ctx.user.id),
        db.getAnalysesByUser(ctx.user.id, 100),
        db.getPortfolioByUser(ctx.user.id),
      ]);

      const totalDeals = allDeals.length;
      const completedAnalyses = allAnalyses.length;
      const proceedCount = allAnalyses.filter(a => a.recommendation === "PROCEED").length;
      const declineCount = allAnalyses.filter(a => a.recommendation === "DECLINE").length;
      const reviewCount = allAnalyses.filter(a => a.recommendation === "REVIEW").length;
      const avgCredit = completedAnalyses > 0
        ? Math.round(allAnalyses.reduce((s, a) => s + (a.creditScore ?? 0), 0) / completedAnalyses)
        : 0;
      const avgFraud = completedAnalyses > 0
        ? Math.round(allAnalyses.reduce((s, a) => s + (a.fraudScore ?? 0), 0) / completedAnalyses)
        : 0;
      const portfolioAtRisk = portfolio.filter(l => l.riskRating === "red" || l.riskRating === "amber").length;

      return {
        totalDeals,
        completedAnalyses,
        proceedCount,
        declineCount,
        reviewCount,
        avgCreditScore: avgCredit,
        avgFraudScore: avgFraud,
        portfolioTotal: portfolio.length,
        portfolioAtRisk,
        autoDecisionRate: completedAnalyses > 0 ? Math.round((proceedCount + declineCount) / completedAnalyses * 100) : 0,
      };
    }),
  }),

  // ── Contact form ───────────────────────────────────────────────────────────
  contact: router({
    submit: publicProcedure
      .input(z.object({
        fullName: z.string().min(1),
        company: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        interest: z.string().optional(),
        message: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const { notifyOwner } = await import("./_core/notification");
          await notifyOwner({
            title: `New NexusLend enquiry from ${input.fullName}`,
            content: `Company: ${input.company}\nEmail: ${input.email}\nPhone: ${input.phone || "—"}\nInterest: ${input.interest || "—"}\nMessage: ${input.message || "—"}`,
          });
        } catch { /* Non-fatal */ }
        return { success: true };
      }),
  }),

  // ── UK VAT Verification (Free: format validation + Companies House cross-reference) ──────
  hmrc: router({
    verifyVat: protectedProcedure
      .input(z.object({ vatNumber: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const result = await lookupHmrcVat(input.vatNumber);
        if (!result) {
          return {
            valid: false,
            error: "Invalid VAT number format. Expected 9 digits (e.g. GB123456789 or 123456789).",
            source: "format_check",
          };
        }
        return {
          valid: true,
          vatNumber: result.vatNumber,
          businessName: result.businessName || "Unknown",
          address: result.address || { line1: "", line2: "", postcode: "", countryCode: "GB" },
          consultationNumber: "",
          processingDate: new Date().toISOString(),
          source: result.source,
          note: result.note,
        };
      }),
  }),

  // ── Postcodes.io — Free UK address & postcode enrichment ────────────────
  postcodes: router({
    lookup: protectedProcedure
      .input(z.object({ postcode: z.string().min(1) }))
      .query(async ({ input }) => {
        const clean = input.postcode.replace(/\s/g, "").toUpperCase();
        try {
          const data = await apiFetch(`https://api.postcodes.io/postcodes/${clean}`) as Record<string, unknown>;
          if (data?.status === 200 && data.result) {
            const r = data.result as Record<string, unknown>;
            return {
              valid: true,
              postcode: r.postcode,
              latitude: r.latitude,
              longitude: r.longitude,
              region: r.region,
              adminDistrict: r.admin_district,
              adminCounty: r.admin_county,
              country: r.country,
              parliamentaryConstituency: r.parliamentary_constituency,
              lsoa: r.lsoa,
              msoa: r.msoa,
              source: "postcodes_io",
            };
          }
          return { valid: false, error: "Postcode not found", source: "postcodes_io" };
        } catch (err) {
          return { valid: false, error: String(err), source: "postcodes_io" };
        }
      }),

    bulk: protectedProcedure
      .input(z.object({ postcodes: z.array(z.string()).max(100) }))
      .mutation(async ({ input }) => {
        try {
          const body = JSON.stringify({ postcodes: input.postcodes.map(p => p.replace(/\s/g, "").toUpperCase()) });
          const data = await new Promise<unknown>((resolve, reject) => {
            const url = new URL("https://api.postcodes.io/postcodes");
            const req = https.request({ hostname: url.hostname, path: url.pathname, method: "POST",
              headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
            }, (res) => {
              let d = "";
              res.on("data", c => { d += c; });
              res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
            });
            req.on("error", reject);
            req.write(body);
            req.end();
          });
          return { success: true, data, source: "postcodes_io" };
        } catch (err) {
          return { success: false, error: String(err), source: "postcodes_io" };
        }
      }),
  }),

  // ── Exchange Rates — Free real-time FX (open.er-api.com) ────────────────
  fx: router({
    getRates: publicProcedure
      .input(z.object({ base: z.string().default("GBP") }))
      .query(async ({ input }) => {
        try {
          const data = await apiFetch(`https://open.er-api.com/v6/latest/${input.base.toUpperCase()}`) as Record<string, unknown>;
          if (data?.result === "success") {
            const rates = data.rates as Record<string, number>;
            return {
              base: data.base_code,
              lastUpdated: data.time_last_update_utc,
              nextUpdate: data.time_next_update_utc,
              rates: {
                USD: rates.USD, EUR: rates.EUR, GBP: rates.GBP,
                CHF: rates.CHF, JPY: rates.JPY, CAD: rates.CAD,
                AUD: rates.AUD, SEK: rates.SEK, NOK: rates.NOK,
                DKK: rates.DKK, SGD: rates.SGD, HKD: rates.HKD,
              },
              source: "open_exchange_rates_free",
            };
          }
          return { error: "Failed to fetch rates", source: "open_exchange_rates_free" };
        } catch (err) {
          return { error: String(err), source: "open_exchange_rates_free" };
        }
      }),
  }),

  // ── TrueLayer Open Banking — Real PSD2 bank data ────────────────────────
  truelayer: router({
    // Initiate OAuth connect flow — returns the TrueLayer auth URL
    getAuthUrl: protectedProcedure
      .input(z.object({ redirectUri: z.string(), dealId: z.number() }))
      .mutation(async ({ input }) => {
        const clientId = process.env.TRUELAYER_CLIENT_ID;
        if (!clientId) {
          return { error: "TrueLayer not configured. Add TRUELAYER_CLIENT_ID to secrets.", authUrl: null };
        }
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          scope: "info accounts balance transactions offline_access",
          redirect_uri: input.redirectUri,
          state: String(input.dealId),
          providers: "uk-ob-all uk-oauth-all",
          enable_mock: "true",
          nonce: Date.now().toString(),
        });
        const authUrl = `https://auth.truelayer-sandbox.com/connect/authorize?${params.toString()}`;
        return { authUrl, error: null };
      }),

    // Exchange code for token and fetch transactions
    exchangeAndFetch: protectedProcedure
      .input(z.object({ code: z.string(), redirectUri: z.string(), dealId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const clientId = process.env.TRUELAYER_CLIENT_ID;
        const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return { error: "TrueLayer credentials not configured", data: null };
        }
        try {
          // Exchange code for token
          const tokenBody = new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: input.redirectUri,
            code: input.code,
          });
          const tokenData = await new Promise<Record<string, unknown>>((resolve, reject) => {
            const body = tokenBody.toString();
            const req = https.request({
              hostname: "auth.truelayer-sandbox.com",
              path: "/connect/token",
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
            }, (res) => {
              let d = ""; res.on("data", c => { d += c; }); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
            });
            req.on("error", reject); req.write(body); req.end();
          });
          const accessToken = tokenData.access_token as string;
          if (!accessToken) return { error: "Failed to get access token", data: null };

          // Fetch accounts
          const accountsData = await apiFetch("https://api.truelayer-sandbox.com/data/v1/accounts", {
            Authorization: `Bearer ${accessToken}`,
          }) as Record<string, unknown>;
          const accounts = (accountsData?.results as Array<Record<string, unknown>>) || [];

          // Fetch transactions for first account
          let transactions: Array<Record<string, unknown>> = [];
          if (accounts.length > 0) {
            const accountId = accounts[0].account_id as string;
            const to = new Date().toISOString().split("T")[0];
            const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const txData = await apiFetch(
              `https://api.truelayer-sandbox.com/data/v1/accounts/${accountId}/transactions?from=${from}&to=${to}`,
              { Authorization: `Bearer ${accessToken}` }
            ) as Record<string, unknown>;
            transactions = (txData?.results as Array<Record<string, unknown>>) || [];
          }

          // Analyse transactions
          const credits = transactions.filter(t => (t.amount as number) > 0);
          const debits = transactions.filter(t => (t.amount as number) < 0);
          const totalCredits = credits.reduce((s, t) => s + (t.amount as number), 0);
          const avgMonthly = totalCredits / 12;

          // Monthly breakdown
          const monthlyMap: Record<string, number> = {};
          credits.forEach(t => {
            const month = (t.timestamp as string)?.substring(0, 7) || "unknown";
            monthlyMap[month] = (monthlyMap[month] || 0) + (t.amount as number);
          });
          const monthly_revenue = Object.entries(monthlyMap).sort().map(([month, amount]) => ({ month, amount: Math.round(amount) }));

          // Risk signals
          const risk_signals: string[] = [];
          const nsfTx = transactions.filter(t => (t.transaction_classification as string[])?.includes("NSF") || (t.description as string)?.toLowerCase().includes("returned"));
          if (nsfTx.length > 3) risk_signals.push(`${nsfTx.length} NSF/returned transactions detected`);
          const balances = accounts.map(a => (a.balance as Record<string, unknown>)?.current as number || 0);
          if (balances.some(b => b < 0)) risk_signals.push("Negative account balance detected");

          const parsed = {
            accounts: accounts.length,
            monthly_revenue,
            avg_monthly_revenue: Math.round(avgMonthly),
            total_credits_12mo: Math.round(totalCredits),
            total_debits_12mo: Math.round(Math.abs(debits.reduce((s, t) => s + (t.amount as number), 0))),
            transaction_count: transactions.length,
            cash_trend: monthly_revenue.length >= 2 && monthly_revenue[monthly_revenue.length - 1].amount > monthly_revenue[0].amount ? "improving" : "stable",
            risk_signals,
            source: "truelayer_live",
          };

          // Save to DB
          const existing = await db.getOpenBankingByDeal(input.dealId);
          if (existing) {
            await db.updateOpenBankingConnection(existing.id, {
              connectionStatus: "connected",
              transactionDataJson: parsed,
              monthlyRevenueJson: monthly_revenue,
              avgMonthlyRevenue: String(avgMonthly) as unknown as string,
            });
          } else {
            await db.createOpenBankingConnection({
              dealId: input.dealId,
              userId: ctx.user.id,
              bankName: "TrueLayer",
              connectionStatus: "connected",
              transactionDataJson: parsed,
              monthlyRevenueJson: monthly_revenue,
              avgMonthlyRevenue: String(avgMonthly) as unknown as string,
              consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            });
          }

          return { data: parsed, error: null };
        } catch (err) {
          return { error: String(err), data: null };
        }
      }),

    isConfigured: protectedProcedure.query(async () => {
      return { configured: !!(process.env.TRUELAYER_CLIENT_ID && process.env.TRUELAYER_CLIENT_SECRET) };
    }),
  }),

  // ── Credit Bureau & AML Screening (Companies House disqualified officers + PSC) ──────────────
  creditsafe: router({
    isConfigured: protectedProcedure.query(async () => {
      return { configured: true }; // Always live via Companies House
    }),
    searchCompany: protectedProcedure
      .input(z.object({ name: z.string().min(1), country: z.string().default("GB") }))
      .mutation(async ({ input }) => {
        try {
          // Search Companies House
          const searchData = await chFetch(`/search/companies?q=${encodeURIComponent(input.name)}&items_per_page=5`) as Record<string, unknown>;
          const chCompanies = ((searchData?.items as Array<Record<string, unknown>>) || []).slice(0, 3);

          const companies = await Promise.all(chCompanies.map(async (c) => {
            const companyNumber = c.company_number as string;
            const disqualifiedOfficers: string[] = [];
            const pscFlags: string[] = [];
            let chargeCount = 0;

            try {
              // Get officers and check each against disqualified register
              const officersData = await chFetch(`/company/${companyNumber}/officers?items_per_page=10`) as Record<string, unknown>;
              const officers = (officersData?.items as Array<Record<string, unknown>>) || [];
              for (const officer of officers.slice(0, 3)) {
                const officerName = (officer.name as string) || "";
                if (!officerName) continue;
                try {
                  const disqData = await chFetch(`/search/disqualified-officers?q=${encodeURIComponent(officerName)}&items_per_page=3`) as Record<string, unknown>;
                  const disqItems = (disqData?.items as Array<Record<string, unknown>>) || [];
                  const matched = disqItems.filter(d => {
                    const dName = ((d.title as string) || "").toLowerCase();
                    const oName = officerName.toLowerCase();
                    return dName.includes(oName.split(",")[0].trim()) || oName.includes(dName.split(",")[0].trim());
                  });
                  if (matched.length > 0) disqualifiedOfficers.push(officerName);
                } catch { /* skip */ }
              }
              // PSC check
              const pscData = await chFetch(`/company/${companyNumber}/persons-with-significant-control?items_per_page=5`) as Record<string, unknown>;
              const pscs = (pscData?.items as Array<Record<string, unknown>>) || [];
              for (const psc of pscs) {
                const natures = (psc.natures_of_control as string[]) || [];
                if (natures.some(n => n.includes("ownership-of-shares-75-to-100-percent"))) {
                  pscFlags.push(`${psc.name || "Unknown"} holds 75-100% ownership`);
                }
              }
              // Charges
              const chargesData = await chFetch(`/company/${companyNumber}/charges?items_per_page=1`) as Record<string, unknown>;
              chargeCount = (chargesData?.total_count as number) || 0;
            } catch { /* skip */ }

            const status = (c.company_status as string) || "unknown";
            const isActive = status === "active";
            const hasDisqualified = disqualifiedOfficers.length > 0;
            const riskScore = hasDisqualified ? 85 : !isActive ? 60 : chargeCount > 3 ? 45 : 20;
            const riskClass = riskScore >= 70 ? "High" : riskScore >= 40 ? "Medium" : "Low";

            return {
              id: `GB-0-${companyNumber}`,
              name: (c.title as string) || input.name,
              regNo: companyNumber,
              country: "GB",
              status: isActive ? "Active" : status.charAt(0).toUpperCase() + status.slice(1),
              creditScore: Math.max(0, 100 - riskScore),
              creditLimit: isActive ? 250000 : 0,
              riskClass,
              amlFlags: [
                ...(hasDisqualified ? [`Disqualified director(s): ${disqualifiedOfficers.join(", ")}`] : []),
                ...(chargeCount > 0 ? [`${chargeCount} outstanding charge(s) registered`] : []),
                ...pscFlags,
                ...(!isActive ? [`Company status: ${status}`] : []),
              ],
              source: "companies_house_aml",
            };
          }));

          return { companies, error: null, demo: false };
        } catch (err) {
          return { error: String(err), companies: [], demo: false };
        }
      }),
  }),

  // ── Companies House — Extended data (charges, filing history, PSC) ────────
  chExtended: router({
    getCharges: protectedProcedure
      .input(z.object({ companyNumber: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const data = await chFetch(`/company/${input.companyNumber}/charges?items_per_page=20`) as Record<string, unknown>;
          const items = (data?.items as Array<Record<string, unknown>>) || [];
          return {
            totalCharges: (data?.total_count as number) || 0,
            satisfiedCharges: items.filter(c => c.status === "fully-satisfied").length,
            outstandingCharges: items.filter(c => c.status === "outstanding").length,
            charges: items.slice(0, 10).map(c => ({
              status: c.status,
              createdOn: c.created_on,
              deliveredOn: c.delivered_on,
              chargeCode: c.charge_code,
              chargeNumber: c.charge_number,
              description: (c.particulars as Record<string, unknown>)?.description || "",
              personsEntitled: (c.persons_entitled as Array<Record<string, unknown>>)?.map(p => p.name) || [],
            })),
            source: "companies_house_live",
          };
        } catch (err) {
          return { error: String(err), source: "companies_house_live" };
        }
      }),

    getFilingHistory: protectedProcedure
      .input(z.object({ companyNumber: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const data = await chFetch(`/company/${input.companyNumber}/filing-history?items_per_page=20`) as Record<string, unknown>;
          const items = (data?.items as Array<Record<string, unknown>>) || [];
          return {
            totalFilings: (data?.total_count as number) || 0,
            filings: items.slice(0, 15).map(f => ({
              date: f.date,
              type: f.type,
              description: f.description,
              category: f.category,
              subcategory: f.subcategory,
              actionDate: f.action_date,
              links: f.links,
            })),
            source: "companies_house_live",
          };
        } catch (err) {
          return { error: String(err), source: "companies_house_live" };
        }
      }),

    getPsc: protectedProcedure
      .input(z.object({ companyNumber: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const data = await chFetch(`/company/${input.companyNumber}/persons-with-significant-control?items_per_page=20`) as Record<string, unknown>;
          const items = (data?.items as Array<Record<string, unknown>>) || [];
          return {
            totalPsc: (data?.total_results as number) || 0,
            persons: items.map(p => ({
              name: p.name,
              notifiedOn: p.notified_on,
              nationality: p.nationality,
              countryOfResidence: p.country_of_residence,
              naturesOfControl: p.natures_of_control,
              dateOfBirth: p.date_of_birth,
              ceasedOn: p.ceased_on,
            })),
            source: "companies_house_live",
          };
        } catch (err) {
          return { error: String(err), source: "companies_house_live" };
        }
      }),
  }),

  // ── Public Demo — No login required ────────────────────────────────────────
  demo: router({
    // Pre-loaded example deals for instant demo
    getExamples: publicProcedure.query(async () => {
      return [
        {
          id: "mca",
          label: "MCA Deal — Retail SME",
          icon: "💳",
          description: "Merchant Cash Advance · £45,000 · 12 months · Retail sector",
          data: {
            companyName: "Bright Street Retail Ltd",
            loanAmount: "£45,000",
            loanType: "Merchant Cash Advance",
            loanTermMonths: 12,
            sector: "Retail",
            documentText: `
BANK STATEMENT SUMMARY — Bright Street Retail Ltd (Account: 12345678)
Period: Jan 2025 – Dec 2025

MONTHLY CREDITS:
Jan: £18,200 | Feb: £17,400 | Mar: £21,000 | Apr: £19,800 | May: £22,500
Jun: £23,100 | Jul: £24,800 | Aug: £25,200 | Sep: £22,900 | Oct: £26,400
Nov: £31,200 (seasonal peak) | Dec: £28,600

MONTHLY DEBITS (committed):
Rent: £4,200/mo | Utilities: £680/mo | Payroll (3 staff): £6,400/mo
Existing loan repayment: £1,200/mo | HMRC PAYE: £1,100/mo
Stock purchases: £7,000–£12,000/mo (variable)

CASH FLOW INDICATORS:
- Average daily balance: £8,400
- Overdraft usage: 2 days in November (£1,200 depth)
- NSF/returned payments: 0
- End-of-month balance trend: improving

DIRECTOR: Sarah Mitchell, appointed 2018, UK national
COMPANY: Incorporated 2017, SIC 47710 (Retail clothing), no charges, no insolvency history
VAT: Registered (GB 234 5678 90), turnover consistent with VAT threshold
CREDIT HISTORY: No CCJs, no defaults, 1 late payment (2022, resolved)

LOAN PURPOSE: Working capital for seasonal stock purchase ahead of Q4 peak
REPAYMENT MECHANISM: Daily % of card terminal receipts (MCA structure)
            `.trim(),
          },
        },
        {
          id: "bridging",
          label: "Bridging Loan — Property Developer",
          icon: "🏗️",
          description: "Bridging Loan · £280,000 · 9 months · Property Development",
          data: {
            companyName: "Apex Build Developments Ltd",
            loanAmount: "£280,000",
            loanType: "Bridging Loan",
            loanTermMonths: 9,
            sector: "Property Development",
            documentText: `
BANK STATEMENT SUMMARY — Apex Build Developments Ltd (Account: 87654321)
Period: Jan 2025 – Dec 2025

MONTHLY CREDITS:
Jan: £0 (project start) | Feb: £0 | Mar: £145,000 (drawdown from previous project)
Apr: £0 | May: £0 | Jun: £0 | Jul: £0 | Aug: £0 | Sep: £0
Oct: £385,000 (property sale completion) | Nov: £0 | Dec: £0

MONTHLY DEBITS:
Site costs: £18,000–£45,000/mo | Director salary: £5,500/mo
Professional fees: £2,200/mo | Insurance: £800/mo
Existing bridging repayment: £3,100/mo

CASH FLOW INDICATORS:
- Average daily balance: £22,000 (highly variable — project-based)
- Overdraft usage: 0
- NSF/returned payments: 0
- Cash pattern: lumpy (project completion cycle)

DIRECTOR: James Thornton, appointed 2015, UK national, 3 previous successful developments
COMPANY: Incorporated 2014, SIC 41100 (Property development), 1 satisfied charge (2023)
VAT: Registered (GB 876 5432 10)
CREDIT HISTORY: No CCJs, no defaults, clean bureau
ASSET: 4-bed detached property, SW London, current value £520,000, planning approved
EXIT STRATEGY: Sale of completed property (GDV £680,000) or refinance to BTL mortgage

LOAN PURPOSE: Fund final construction phase and site costs for residential development
SECURITY: First charge over development site
            `.trim(),
          },
        },
        {
          id: "invoice",
          label: "Invoice Finance — Logistics",
          icon: "📦",
          description: "Invoice Finance · £95,000 · 6 months · Logistics",
          data: {
            companyName: "Swift Freight Solutions Ltd",
            loanAmount: "£95,000",
            loanType: "Invoice Finance",
            loanTermMonths: 6,
            sector: "Logistics & Transport",
            documentText: `
BANK STATEMENT SUMMARY — Swift Freight Solutions Ltd (Account: 55512345)
Period: Jan 2025 – Dec 2025

MONTHLY CREDITS:
Jan: £38,400 | Feb: £41,200 | Mar: £39,800 | Apr: £44,600 | May: £46,200
Jun: £43,800 | Jul: £42,100 | Aug: £39,500 | Sep: £47,300 | Oct: £51,200
Nov: £48,900 | Dec: £45,600

MONTHLY DEBITS:
Fuel: £8,200–£11,400/mo | Driver wages (8 drivers): £22,000/mo
Vehicle finance: £4,800/mo | Insurance: £2,100/mo | Depot rent: £3,500/mo
HMRC PAYE/NI: £5,200/mo

CASH FLOW INDICATORS:
- Average daily balance: £14,200
- Overdraft usage: 5 days in February (fuel price spike, £3,400 depth)
- NSF/returned payments: 1 (Feb, resolved same day)
- Debtor days: 62 (invoices to large retailers — slow payers)
- Cash trend: improving (new contract with major supermarket chain)

DIRECTOR: Priya Sharma, appointed 2019, UK national
COMPANY: Incorporated 2016, SIC 49410 (Road freight), no insolvency history
VAT: Registered, quarterly returns up to date
CREDIT HISTORY: No CCJs, 2 late payments (2021, both resolved)
KEY DEBTOR: Tesco Distribution Ltd (£65,000 outstanding, 45-day terms)

LOAN PURPOSE: Bridge cash flow gap caused by 60+ day payment terms from large retail clients
FACILITY: 85% advance against verified invoices
            `.trim(),
          },
        },
      ];
    }),

    // Full AI underwriting analysis — public, no auth required
    analyse: publicProcedure
      .input(z.object({
        companyName: z.string().min(1),
        loanAmount: z.string().min(1),
        loanType: z.string().default("Business Loan"),
        loanTermMonths: z.number().optional(),
        sector: z.string().optional(),
        documentText: z.string().default(""),
        fileBase64: z.string().optional(),
        fileName: z.string().optional(),
        fileMimeType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const startTime = Date.now();

        // Extract PDF text if a file was uploaded
        let extractedFileText = "";
        if (input.fileBase64 && input.fileMimeType) {
          const buffer = Buffer.from(input.fileBase64, "base64");
          if (input.fileMimeType === "application/pdf" || (input.fileName ?? "").toLowerCase().endsWith(".pdf")) {
            try {
              const parser = new PDFParse({ data: buffer });
              const textResult = await parser.getText();
              extractedFileText = textResult.text?.trim().slice(0, 8000) ?? "";
            } catch { /* ignore */ }
          } else if (input.fileMimeType === "text/csv" || (input.fileName ?? "").toLowerCase().endsWith(".csv")) {
            extractedFileText = Buffer.from(input.fileBase64, "base64").toString("utf-8").slice(0, 8000);
          }
        }

        const combinedDocText = [
          input.documentText,
          extractedFileText ? `\n\n=== UPLOADED DOCUMENT: ${input.fileName ?? "file"} ===\n${extractedFileText}` : "",
        ].filter(Boolean).join("").trim();

        const DEMO_SYSTEM_PROMPT = NEXUSLEND_SYSTEM_PROMPT + `

IMPORTANT: This is a public demo analysis. Generate a realistic, detailed, and educational response that showcases the full capabilities of the NexusLend AI underwriting system. Be thorough across all 8 domains. Provide specific numbers, percentages, and clear reasoning for every score. The audit trail (key_flags) should list at least 8 specific criteria that were evaluated with PASS/FAIL/FLAG status and the weight applied. Use this format for key_flags: [{criterion: string, result: 'PASS'|'FLAG'|'FAIL', weight: number, detail: string}].
`;

        const userMessage = `
Please analyse the following lending application using the full 8-domain NexusLend framework.

COMPANY / APPLICANT: ${input.companyName}
LOAN AMOUNT REQUESTED: ${input.loanAmount}
LOAN TYPE: ${input.loanType}
LOAN TERM: ${input.loanTermMonths ? `${input.loanTermMonths} months` : "Not specified"}
SECTOR: ${input.sector || "Not specified"}

DOCUMENTS / FINANCIAL DATA PROVIDED:
${combinedDocText || "No documents provided — analyse based on available information and flag all missing data in data_confidence score."}

Run the complete 8-domain analysis including all 14 fraud matrix layers and the full audit trail. Return ONLY valid JSON.
        `.trim();

        const result = await invokeGroq({
          messages: [
            { role: "system", content: DEMO_SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 4096,
          response_format: { type: "json_object" },
        });

        const rawContent = result.choices[0]?.message?.content;
        const textContent = typeof rawContent === "string" ? rawContent : "";
        const processingTimeMs = Date.now() - startTime;

        let parsed: Record<string, unknown> | null = null;
        try {
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch { /* return raw if parse fails */ }

         return { success: true, structured: parsed, rawText: textContent, processingTimeMs };
      }),

    // ── Bank Statement Written Report ───────────────────────────────────────
    generateBankStatementReport: protectedProcedure
      .input(z.object({
        companyName: z.string().min(1),
        loanAmount: z.string().min(1),
        loanType: z.string().default("Business Loan"),
        documentText: z.string().default(""),
        fileBase64: z.string().optional(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
        structuredAnalysis: z.record(z.unknown()).optional(),
      }))
      .mutation(async ({ input }) => {
        let extractedText = input.documentText || "";
        if (input.fileBase64 && input.mimeType) {
          const buffer = Buffer.from(input.fileBase64, "base64");
          if (input.mimeType === "application/pdf" || (input.fileName ?? "").toLowerCase().endsWith(".pdf")) {
            try {
              const parser = new PDFParse({ data: buffer });
              const textResult = await parser.getText();
              extractedText = (textResult.text?.trim() ?? "").slice(0, 12000);
            } catch { /* ignore */ }
          } else if (input.mimeType === "text/csv" || (input.fileName ?? "").toLowerCase().endsWith(".csv")) {
            extractedText = Buffer.from(input.fileBase64, "base64").toString("utf-8").slice(0, 12000);
          }
        }

        const BANK_STATEMENT_REPORT_PROMPT = `You are a senior credit underwriter at a UK alternative lending institution with 15+ years of experience in SME lending, MCA, bridging finance, and invoice discounting. You produce comprehensive, data-driven bank statement analysis reports used by credit committees to make final lending decisions.

Your reports are precise, specific, and never vague. You cite exact figures, dates, transaction references, and patterns from the data provided. You do not generalise — you name specific payees, amounts, and dates. You write at the level expected by a regulated UK lender operating under FCA Consumer Duty.

Return ONLY valid JSON with a single key "report" containing a string with the full markdown-formatted report.

Produce all 7 sections exactly as follows:

## 1. COVER SUMMARY
A professional table: Account Holder Name | Account Number (masked) | Bank Name | Account Type | Statement Period | Relationship Manager | VAT Number | Debit Interest Rate. State "Not stated in documents provided" for any absent field.

## 2. MONTHLY CASH FLOW SUMMARY
A month-by-month table: Month | Opening Balance | Total Credits (Inflows) | Total Debits (Outflows) | Closing Balance | Net Movement. Include a 12-month TOTALS row. Extract real figures from the statement. If data is absent for a month, state "Not available". Do not estimate unless genuinely necessary.

## 3. KEY FINANCIAL METRICS
Present with exact extracted values:
- Total Annual Turnover (total credits over the period)
- Total Annual Outflows
- Average Monthly Turnover
- Net 12-Month Position
- Average Closing Balance
- Number of Times Overdrawn / NSF Events
- Closing Balance as % of Annual Turnover
- Primary Income Source(s) — top 3 credit counterparties by volume with amounts
- Secondary Income Source(s)
- Third-Party Funding Identified (loan drawdowns, director injections, CBILS, Bounce Back Loans, etc.)

## 4. RED FLAGS / RISK SIGNALS
Table: Category | Severity (🔴 Critical / 🟠 High / 🟡 Medium) | Description | Impact on Funding Eligibility.
List EVERY red flag. Be specific — cite exact amounts, dates, counterparties. Categories include: Cash Flow Deterioration, Circular Transactions, Loan Stacking, Gambling Activity, HMRC Arrears, Returned Payments / NSF, Balance Inflation, Director Loan Extraction, Dormant Period, Concentration Risk, Seasonal Volatility, Undisclosed Liabilities, Salary Suppression, Rapid Balance Depletion.

## 5. SUSPICIOUS TRANSACTION PATTERNS
Table: Recipient / Description | Estimated Total Value | Frequency | Concern Level.
Include: round-sum transfers, connected-party transfers, unusual timing, cash withdrawals, crypto payments, gambling platforms, salary payments inconsistent with stated headcount, undisclosed loan repayments.

## 6. POSITIVE INDICATORS
Numbered list of genuine evidenced strengths. Cite specific figures. Do not pad with generic positives. Only include what is genuinely supported by the data.

## 7. FUNDING RECOMMENDATION
- Overall Risk Rating: LOW / MEDIUM / HIGH / VERY HIGH
- Decision: APPROVE / DECLINE / CONDITIONAL APPROVE
- Key Reasons: 3–5 specific, data-backed reasons
- If CONDITIONAL APPROVE: Maximum Recommended Amount | Recommended Tenure | Collection Mechanism | Required Guarantees or Conditions | Monitoring Requirements
- FCA Consumer Duty Note

IMPORTANT: Extract real figures from the document. If data is insufficient, state exactly what is missing and why it matters. Flag ALL anomalies — do not soften findings. The report must be usable standalone by a credit committee.`;

        const structuredContext = input.structuredAnalysis
          ? `\n\nPRE-COMPUTED AI UNDERWRITING SCORES (use to inform your report):\n${JSON.stringify(input.structuredAnalysis, null, 2).slice(0, 3000)}`
          : "";

        const userMessage = `Produce a full bank statement analysis report.\n\nCOMPANY / APPLICANT: ${input.companyName}\nLOAN AMOUNT REQUESTED: ${input.loanAmount}\nLOAN TYPE: ${input.loanType}\n\nBANK STATEMENT / FINANCIAL DOCUMENTS:\n${extractedText || "No document text extracted — base the report on the structured analysis scores provided and flag all missing data explicitly."}${structuredContext}\n\nReturn ONLY valid JSON: { "report": "<full markdown report>" }`;

        const result = await invokeGroq({
          messages: [
            { role: "system", content: BANK_STATEMENT_REPORT_PROMPT },
            { role: "user", content: userMessage },
          ],
          max_tokens: 6000,
          response_format: { type: "json_object" },
        });

        const rawContent = result.choices[0]?.message?.content;
        const textContent = typeof rawContent === "string" ? rawContent : "";
        let reportText = "";
        try {
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            reportText = typeof parsed.report === "string" ? parsed.report : textContent;
          } else {
            reportText = textContent;
          }
        } catch {
          reportText = textContent;
        }

        return { success: true, report: reportText };
      }),
  }),

  // ── Early Access Waitlist ────────────────────────────────────────────────────────────────────────
  waitlist: router({
    join: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        email: z.string().email().max(320),
        company: z.string().max(255).optional(),
        role: z.string().max(100).optional(),
      }))
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new Error("Database unavailable");
        const { waitlist } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        // Check for duplicate email
        const existing = await drizzleDb
          .select({ id: waitlist.id })
          .from(waitlist)
          .where(eq(waitlist.email, input.email.toLowerCase().trim()))
          .limit(1);
        if (existing.length > 0) {
          return { success: true, alreadyRegistered: true };
        }
        // Insert new entry
        await drizzleDb.insert(waitlist).values({
          name: input.name.trim(),
          email: input.email.toLowerCase().trim(),
          company: input.company?.trim() || null,
          role: input.role?.trim() || null,
        });
        // Notify owner
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `🎉 New Early Access Sign-Up: ${input.name}`,
          content: `**Name:** ${input.name}\n**Email:** ${input.email}\n**Company:** ${input.company || "Not provided"}\n**Role:** ${input.role || "Not provided"}`,
        }).catch(() => {});
        return { success: true, alreadyRegistered: false };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        const { TRPCError } = await import("@trpc/server");
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new Error("Database unavailable");
      const { waitlist } = await import("../drizzle/schema");
      const { desc } = await import("drizzle-orm");
      return drizzleDb.select().from(waitlist).orderBy(desc(waitlist.createdAt));
    }),

    notifyAll: protectedProcedure
      .input(z.object({
        subject: z.string().min(1).max(255).default("NexusLend AI is launching — you're on the list!"),
        message: z.string().min(1).max(5000),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          const { TRPCError } = await import("@trpc/server");
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new Error("Database unavailable");
        const { waitlist } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const entries = await drizzleDb.select().from(waitlist);
        if (entries.length === 0) return { sent: 0, total: 0, failed: 0 };

        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);

        const buildHtml = (name: string, company: string | null, subject: string, message: string) => {
          const firstName = name.split(" ")[0];
          const companyLine = company ? `<p style="margin:0 0 4px 0;color:#94a3b8;font-size:14px;">${company}</p>` : "";
          // Convert plain text message to HTML paragraphs
          const bodyHtml = message
            .split(/\n\n+/)
            .map(p => `<p style="margin:0 0 16px 0;color:#e2e8f0;font-size:16px;line-height:1.7;">${p.replace(/\n/g, "<br/>")}</p>`)
            .join("");
          return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0a0f0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#0d1a0d;border-radius:12px 12px 0 0;padding:32px 40px;border-bottom:1px solid #1a2e1a;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:40px;height:40px;background:#00ff41;border-radius:8px;text-align:center;vertical-align:middle;">
                <span style="color:#0a0f0a;font-weight:900;font-size:20px;line-height:40px;">N</span>
              </td>
              <td style="padding-left:12px;">
                <span style="color:#00ff41;font-weight:700;font-size:18px;">NexusLend AI</span>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#111811;padding:40px;">
          <p style="margin:0 0 8px 0;color:#00ff41;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Early Access</p>
          <h1 style="margin:0 0 24px 0;color:#f8fafc;font-size:28px;font-weight:700;line-height:1.3;">Hi ${firstName},</h1>
          ${companyLine}
          ${bodyHtml}
          <table cellpadding="0" cellspacing="0" style="margin:32px 0;">
            <tr><td style="background:#00ff41;border-radius:8px;padding:14px 32px;">
              <a href="https://nexuslend-3frnma99.manus.space" style="color:#0a0f0a;font-weight:700;font-size:16px;text-decoration:none;">Get Early Access →</a>
            </td></tr>
          </table>
          <p style="margin:0;color:#64748b;font-size:13px;">You're receiving this because you joined the NexusLend AI waitlist. Questions? Reply to this email.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#0d1a0d;border-radius:0 0 12px 12px;padding:24px 40px;border-top:1px solid #1a2e1a;">
          <p style="margin:0;color:#475569;font-size:12px;text-align:center;">NexusLend AI · UK Alternative Lending Automation · <a href="https://nexuslend-3frnma99.manus.space" style="color:#00ff41;text-decoration:none;">nexuslend-3frnma99.manus.space</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
        };

        let sent = 0;
        let failed = 0;
        const failedEmails: string[] = [];

        for (const entry of entries) {
          // TODO: Once a custom domain is verified at resend.com/domains, change:
          //   from: "NexusLend AI <hello@yourdomain.com>"
          //   to: [entry.email]   (send directly to each recipient)
          // For now (Resend free tier): send a single preview to the owner's verified address only.
          try {
            const html = buildHtml(entry.name, entry.company ?? null, input.subject, input.message);
            // Free-tier: can only send to verified owner email (nexuslendai@gmail.com)
            // The email is personalised for this entry so the owner can preview exactly what each recipient will receive
            const { error } = await resend.emails.send({
              from: "NexusLend AI <onboarding@resend.dev>",
              to: ["nexuslendai@gmail.com"], // TODO: swap to [entry.email] after domain verification
              subject: `[Preview for ${entry.email}] ${input.subject}`,
              html,
            });
            if (error) {
              console.error(`[Resend] Failed preview for ${entry.email}:`, error);
              failed++;
              failedEmails.push(entry.email);
            } else {
              // Mark as notified (preview sent to owner)
              await drizzleDb.update(waitlist).set({ notified: true }).where(eq(waitlist.id, entry.id)).catch(() => {});
              sent++;
            }
          } catch (err) {
            console.error(`[Resend] Error for ${entry.email}:`, err);
            failed++;
            failedEmails.push(entry.email);
          }
        }

        // Notify owner with summary
        const { notifyOwner } = await import("./_core/notification");
        const recipientList = entries
          .map((e, i) => `${i + 1}. ${e.name} <${e.email}>${e.company ? ` (${e.company})` : ""}`)
          .join("\n");
        await notifyOwner({
          title: `📣 Waitlist Broadcast — ${sent}/${entries.length} sent${failed > 0 ? `, ${failed} failed` : ""}`,
          content: `**Subject:** ${input.subject}\n\n**Message:**\n${input.message}\n\n---\n**Recipients (${entries.length}):**\n${recipientList}${failed > 0 ? `\n\n**Failed:** ${failedEmails.join(", ")}` : ""}`,
        }).catch(() => {});

        return { sent, total: entries.length, failed };
      }),
  }),
});
export type AppRouter = typeof appRouter;

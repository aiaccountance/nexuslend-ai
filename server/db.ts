import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  deals, InsertDeal,
  analyses, InsertAnalysis,
  portfolioLoans, InsertPortfolioLoan,
  fraudChecks, InsertFraudCheck,
  policyRules, InsertPolicyRule,
  modelMetrics, InsertModelMetric,
  openBankingConnections, InsertOpenBankingConnection,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Deals ────────────────────────────────────────────────────────────────────
export async function createDeal(deal: InsertDeal) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(deals).values(deal);
  return result;
}

export async function getDealsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deals).where(eq(deals.userId, userId)).orderBy(desc(deals.createdAt));
}

export async function getDealById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(deals).where(and(eq(deals.id, id), eq(deals.userId, userId))).limit(1);
  return result[0];
}

export async function updateDealStatus(id: number, status: InsertDeal["status"]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(deals).set({ status }).where(eq(deals.id, id));
}

export async function deleteDeal(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(deals).where(and(eq(deals.id, id), eq(deals.userId, userId)));
}

// ─── Analyses ─────────────────────────────────────────────────────────────────
export async function createAnalysis(analysis: InsertAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(analyses).values(analysis);
  return result;
}

export async function getAnalysesByDeal(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(analyses).where(eq(analyses.dealId, dealId)).orderBy(desc(analyses.createdAt));
}

export async function getAnalysesByUser(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(analyses).where(eq(analyses.userId, userId)).orderBy(desc(analyses.createdAt)).limit(limit);
}

export async function getLatestAnalysisByDeal(dealId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(analyses).where(eq(analyses.dealId, dealId)).orderBy(desc(analyses.createdAt)).limit(1);
  return result[0];
}

// ─── Portfolio Loans ──────────────────────────────────────────────────────────
export async function createPortfolioLoan(loan: InsertPortfolioLoan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(portfolioLoans).values(loan);
  return result;
}

export async function getPortfolioByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(portfolioLoans).where(eq(portfolioLoans.userId, userId)).orderBy(desc(portfolioLoans.createdAt));
}

export async function updatePortfolioLoan(id: number, data: Partial<InsertPortfolioLoan>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(portfolioLoans).set(data).where(eq(portfolioLoans.id, id));
}

export async function deletePortfolioLoan(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(portfolioLoans).where(and(eq(portfolioLoans.id, id), eq(portfolioLoans.userId, userId)));
}

// ─── Fraud Checks ─────────────────────────────────────────────────────────────
export async function createFraudCheck(check: InsertFraudCheck) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(fraudChecks).values(check);
  return result;
}

export async function getFraudChecksByDeal(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fraudChecks).where(eq(fraudChecks.dealId, dealId)).orderBy(desc(fraudChecks.createdAt));
}

// ─── Policy Rules ─────────────────────────────────────────────────────────────
export async function getPolicyRulesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(policyRules).where(eq(policyRules.userId, userId)).orderBy(policyRules.priority);
}

export async function createPolicyRule(rule: InsertPolicyRule) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(policyRules).values(rule);
  return result;
}

export async function updatePolicyRule(id: number, userId: number, data: Partial<InsertPolicyRule>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(policyRules).set(data).where(and(eq(policyRules.id, id), eq(policyRules.userId, userId)));
}

export async function deletePolicyRule(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(policyRules).where(and(eq(policyRules.id, id), eq(policyRules.userId, userId)));
}

// ─── Model Metrics ────────────────────────────────────────────────────────────
export async function getModelMetricsByUser(userId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(modelMetrics).where(eq(modelMetrics.userId, userId)).orderBy(desc(modelMetrics.metricDate)).limit(limit);
}

export async function createModelMetric(metric: InsertModelMetric) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(modelMetrics).values(metric);
  return result;
}

// ─── Open Banking ─────────────────────────────────────────────────────────────
export async function createOpenBankingConnection(conn: InsertOpenBankingConnection) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(openBankingConnections).values(conn);
  return result;
}

export async function getOpenBankingByDeal(dealId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(openBankingConnections).where(eq(openBankingConnections.dealId, dealId)).limit(1);
  return result[0];
}

export async function updateOpenBankingConnection(id: number, data: Partial<InsertOpenBankingConnection>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(openBankingConnections).set(data).where(eq(openBankingConnections.id, id));
}

export async function getLatestOpenBankingByUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { desc } = await import("drizzle-orm");
  const result = await db
    .select()
    .from(openBankingConnections)
    .where(eq(openBankingConnections.userId, userId))
    .orderBy(desc(openBankingConnections.updatedAt))
    .limit(1);
  return result[0];
}

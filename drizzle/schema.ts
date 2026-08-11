import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Deals (loan applications submitted for analysis) ─────────────────────────
export const deals = mysqlTable("deals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  companyNumber: varchar("companyNumber", { length: 20 }),
  loanAmount: decimal("loanAmount", { precision: 12, scale: 2 }).notNull(),
  loanType: varchar("loanType", { length: 100 }).notNull(),
  loanTermMonths: int("loanTermMonths"),
  sector: varchar("sector", { length: 100 }),
  status: mysqlEnum("status", [
    "pending",
    "analysing",
    "complete",
    "flagged",
    "declined",
    "approved",
  ])
    .default("pending")
    .notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high"])
    .default("medium")
    .notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = typeof deals.$inferInsert;

// ─── AI Analyses (results from the 8-domain analyser) ─────────────────────────
export const analyses = mysqlTable("analyses", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  userId: int("userId").notNull(),
  creditScore: int("creditScore"),
  fraudScore: int("fraudScore"),
  affordabilityScore: int("affordabilityScore"),
  dataConfidenceScore: int("dataConfidenceScore"),
  recommendation: mysqlEnum("recommendation", ["PROCEED", "REVIEW", "DECLINE"]),
  recommendationReason: text("recommendationReason"),
  fraudMatrixJson: json("fraudMatrixJson"),
  scoresJson: json("scoresJson"),
  narrativeJson: json("narrativeJson"),
  keyFlagsJson: json("keyFlagsJson"),
  rawText: text("rawText"),
  documentsAnalysed: int("documentsAnalysed").default(0),
  processingTimeMs: int("processingTimeMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = typeof analyses.$inferInsert;

// ─── Portfolio Loans (funded loans being monitored) ───────────────────────────
export const portfolioLoans = mysqlTable("portfolio_loans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  dealId: int("dealId"),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  loanAmount: decimal("loanAmount", { precision: 12, scale: 2 }).notNull(),
  outstandingBalance: decimal("outstandingBalance", {
    precision: 12,
    scale: 2,
  }).notNull(),
  monthlyRepayment: decimal("monthlyRepayment", {
    precision: 10,
    scale: 2,
  }).notNull(),
  interestRate: decimal("interestRate", { precision: 5, scale: 2 }).notNull(),
  startDate: timestamp("startDate").notNull(),
  maturityDate: timestamp("maturityDate").notNull(),
  sector: varchar("sector", { length: 100 }),
  status: mysqlEnum("status", [
    "current",
    "watch",
    "arrears",
    "default",
    "redeemed",
  ])
    .default("current")
    .notNull(),
  riskRating: mysqlEnum("riskRating", ["green", "amber", "red"])
    .default("green")
    .notNull(),
  lastMonitoredAt: timestamp("lastMonitoredAt"),
  earlyWarningFlags: json("earlyWarningFlags"),
  revenueLastMonth: decimal("revenueLastMonth", { precision: 12, scale: 2 }),
  revenueTrend: mysqlEnum("revenueTrend", [
    "improving",
    "stable",
    "declining",
  ]).default("stable"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PortfolioLoan = typeof portfolioLoans.$inferSelect;
export type InsertPortfolioLoan = typeof portfolioLoans.$inferInsert;

// ─── Fraud Checks (velocity & network fraud detection log) ────────────────────
export const fraudChecks = mysqlTable("fraud_checks", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  userId: int("userId").notNull(),
  checkType: varchar("checkType", { length: 100 }).notNull(),
  result: mysqlEnum("result", [
    "PASS",
    "FLAG",
    "ALERT",
    "REQUIRES_LIVE_API",
  ]).notNull(),
  details: text("details"),
  riskScore: int("riskScore").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FraudCheck = typeof fraudChecks.$inferSelect;
export type InsertFraudCheck = typeof fraudChecks.$inferInsert;

// ─── Policy Rules (lender-configurable policy engine) ─────────────────────────
export const policyRules = mysqlTable("policy_rules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  ruleName: varchar("ruleName", { length: 255 }).notNull(),
  ruleType: mysqlEnum("ruleType", [
    "auto_decline",
    "auto_approve",
    "flag_review",
    "pricing",
    "condition",
  ]).notNull(),
  field: varchar("field", { length: 100 }).notNull(),
  operator: mysqlEnum("operator", [
    "gt",
    "lt",
    "gte",
    "lte",
    "eq",
    "neq",
    "contains",
  ]).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  action: text("action").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  priority: int("priority").default(100).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PolicyRule = typeof policyRules.$inferSelect;
export type InsertPolicyRule = typeof policyRules.$inferInsert;

// ─── Model Metrics (continuous learning & drift monitoring) ───────────────────
export const modelMetrics = mysqlTable("model_metrics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  metricDate: timestamp("metricDate").defaultNow().notNull(),
  totalDecisions: int("totalDecisions").default(0),
  autoApprovalRate: decimal("autoApprovalRate", { precision: 5, scale: 2 }),
  averageCreditScore: decimal("averageCreditScore", { precision: 5, scale: 2 }),
  averageFraudScore: decimal("averageFraudScore", { precision: 5, scale: 2 }),
  proceedRate: decimal("proceedRate", { precision: 5, scale: 2 }),
  reviewRate: decimal("reviewRate", { precision: 5, scale: 2 }),
  declineRate: decimal("declineRate", { precision: 5, scale: 2 }),
  avgProcessingTimeMs: int("avgProcessingTimeMs"),
  driftPsi: decimal("driftPsi", { precision: 5, scale: 4 }),
  driftAlert: boolean("driftAlert").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelMetric = typeof modelMetrics.$inferSelect;
export type InsertModelMetric = typeof modelMetrics.$inferInsert;

// ─── Open Banking Connections ─────────────────────────────────────────────────
export const openBankingConnections = mysqlTable("open_banking_connections", {
  id: int("id").autoincrement().primaryKey(),
  dealId: int("dealId").notNull(),
  userId: int("userId").notNull(),
  bankName: varchar("bankName", { length: 100 }),
  connectionStatus: mysqlEnum("connectionStatus", [
    "pending",
    "connected",
    "expired",
    "revoked",
  ])
    .default("pending")
    .notNull(),
  consentExpiresAt: timestamp("consentExpiresAt"),
  transactionDataJson: json("transactionDataJson"),
  monthlyRevenueJson: json("monthlyRevenueJson"),
  nsfCount: int("nsfCount").default(0),
  avgMonthlyRevenue: decimal("avgMonthlyRevenue", { precision: 12, scale: 2 }),
  revenueVolatility: decimal("revenueVolatility", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OpenBankingConnection = typeof openBankingConnections.$inferSelect;
export type InsertOpenBankingConnection =
  typeof openBankingConnections.$inferInsert;

// ─── Early Access Waitlist ───────────────────────────────────────────────────────────────────────────────
export const waitlist = mysqlTable("waitlist", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  company: varchar("company", { length: 255 }),
  role: varchar("role", { length: 100 }),
  notified: boolean("notified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Waitlist = typeof waitlist.$inferSelect;
export type InsertWaitlist = typeof waitlist.$inferInsert;
// ─── Outfit Arena — outfit posts ─────────────────────────────────────────────
export const outfitPosts = mysqlTable("outfit_posts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }).notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  caption: text("caption"),
  category: mysqlEnum("category", [
    "casual",
    "streetwear",
    "formal",
    "athletic",
    "vintage",
    "other",
  ])
    .default("other")
    .notNull(),
  aiTags: json("aiTags"),
  aiStyleScore: int("aiStyleScore"),
  aiOccasion: varchar("aiOccasion", { length: 255 }),
  aiFeedback: text("aiFeedback"),
  aiSuggestions: json("aiSuggestions"),
  eloRating: int("eloRating").default(1200).notNull(),
  battleWins: int("battleWins").default(0).notNull(),
  battleLosses: int("battleLosses").default(0).notNull(),
  ratingSum: int("ratingSum").default(0).notNull(),
  ratingCount: int("ratingCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OutfitPost = typeof outfitPosts.$inferSelect;
export type InsertOutfitPost = typeof outfitPosts.$inferInsert;

// ─── Outfit Arena — star ratings (1 per user per post) ───────────────────────
export const outfitRatings = mysqlTable("outfit_ratings", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  rating: int("rating").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
// Note: one rating per (postId, userId) is enforced in the application layer
// (server/outfitsDb.ts rateOutfitPost does a find-then-update-or-insert), not
// via a DB constraint, to keep this additive to the existing schema.

export type OutfitRating = typeof outfitRatings.$inferSelect;
export type InsertOutfitRating = typeof outfitRatings.$inferInsert;

// ─── Outfit Arena — head-to-head battle log ──────────────────────────────────
export const outfitMatchups = mysqlTable("outfit_matchups", {
  id: int("id").autoincrement().primaryKey(),
  postAId: int("postAId").notNull(),
  postBId: int("postBId").notNull(),
  winnerId: int("winnerId").notNull(),
  voterUserId: int("voterUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OutfitMatchup = typeof outfitMatchups.$inferSelect;
export type InsertOutfitMatchup = typeof outfitMatchups.$inferInsert;

// ─── Outfit Arena — follows ───────────────────────────────────────────────────
export const outfitFollows = mysqlTable("outfit_follows", {
  id: int("id").autoincrement().primaryKey(),
  followerId: int("followerId").notNull(),
  followingId: int("followingId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OutfitFollow = typeof outfitFollows.$inferSelect;
export type InsertOutfitFollow = typeof outfitFollows.$inferInsert;

// ─── Outfit Arena — comments on posts ────────────────────────────────────────
export const outfitComments = mysqlTable("outfit_comments", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OutfitComment = typeof outfitComments.$inferSelect;
export type InsertOutfitComment = typeof outfitComments.$inferInsert;

// ─── Wardrobe — individual garments a user owns ──────────────────────────────
export const wardrobeItems = mysqlTable("wardrobe_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }).notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  // A generated version of the photo on a clean studio backdrop. Null when
  // generation failed or has not run — always fall back to imageUrl.
  cleanImageUrl: varchar("cleanImageUrl", { length: 512 }),
  cleanImageKey: varchar("cleanImageKey", { length: 512 }),
  name: varchar("name", { length: 160 }).notNull(),
  slot: mysqlEnum("slot", [
    "top",
    "bottom",
    "outerwear",
    "shoes",
    "accessory",
    "dress",
  ]).notNull(),
  colour: varchar("colour", { length: 80 }),
  aiTags: json("aiTags"),
  aiNotes: text("aiNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WardrobeItem = typeof wardrobeItems.$inferSelect;
export type InsertWardrobeItem = typeof wardrobeItems.$inferInsert;

// ─── Wardrobe — outfits composed from wardrobe items ─────────────────────────
export const wardrobeOutfits = mysqlTable("wardrobe_outfits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  itemIds: json("itemIds").notNull(),
  occasion: varchar("occasion", { length: 160 }),
  aiRationale: text("aiRationale"),
  aiScore: int("aiScore"),
  source: mysqlEnum("source", ["ai", "manual"]).default("manual").notNull(),
  // A generated image of the outfit being worn.
  renderImageUrl: varchar("renderImageUrl", { length: 512 }),
  renderImageKey: varchar("renderImageKey", { length: 512 }),
  renderStyle: mysqlEnum("renderStyle", ["mannequin", "personal"]),
  // Set once this outfit has been published into the competition feed.
  postedPostId: int("postedPostId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WardrobeOutfit = typeof wardrobeOutfits.$inferSelect;
export type InsertWardrobeOutfit = typeof wardrobeOutfits.$inferInsert;

// ─── Wardrobe — the user's own photo, used to render outfits on them ─────────
// One per user. `consentedAt` records that they confirmed the photo is of
// themselves; without it no personal render is produced.
export const wardrobeModels = mysqlTable("wardrobe_models", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  imageUrl: varchar("imageUrl", { length: 512 }).notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  consentedAt: timestamp("consentedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WardrobeModel = typeof wardrobeModels.$inferSelect;
export type InsertWardrobeModel = typeof wardrobeModels.$inferInsert;

// ─── Outfit Arena accounts ────────────────────────────────────────────────────
// Outfit Arena has its own identity: a handle people are known by, and a
// password so they can sign up without going through the lending product's
// sign-in. It hangs off `users` rather than adding columns to it, so the
// lending side is untouched and an account here is always removable.
//
// `passwordHash` is null for someone who arrived through the existing sign-in
// and only claimed a handle — they keep signing in the way they already do.
export const outfitAccounts = mysqlTable("outfit_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  // Stored lowercase; `displayUsername` keeps the capitalisation they chose.
  username: varchar("username", { length: 30 }).notNull().unique(),
  displayUsername: varchar("displayUsername", { length: 30 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  bio: varchar("bio", { length: 200 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  avatarKey: varchar("avatarKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OutfitAccount = typeof outfitAccounts.$inferSelect;
export type InsertOutfitAccount = typeof outfitAccounts.$inferInsert;

// ─── The figure someone's outfits are shown on ────────────────────────────────
// Deliberately a set of choices rather than a generated picture. A drawn figure
// with the proportions and skin tone someone picked is instant, free, identical
// every time, and reads as a design choice; a generated body reads as a failed
// photograph. One row per person, created the first time they open the styler.
export const outfitAvatars = mysqlTable("outfit_avatars", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  // Index into the app's skin tone ramp, kept as a name so the palette can be
  // re-tuned without rewriting everyone's saved choice.
  skinTone: mysqlEnum("skinTone", [
    "porcelain",
    "fair",
    "light",
    "medium",
    "tan",
    "bronze",
    "deep",
    "rich",
  ])
    .default("medium")
    .notNull(),
  bodyShape: mysqlEnum("bodyShape", [
    "slim",
    "straight",
    "athletic",
    "curvy",
    "full",
  ])
    .default("straight")
    .notNull(),
  height: mysqlEnum("height", ["petite", "average", "tall"])
    .default("average")
    .notNull(),
  hairStyle: mysqlEnum("hairStyle", [
    "none",
    "short",
    "medium",
    "long",
    "curly",
    "afro",
    "bun",
  ])
    .default("short")
    .notNull(),
  hairColor: mysqlEnum("hairColor", [
    "black",
    "brown",
    "blonde",
    "auburn",
    "red",
    "grey",
    "dyed",
  ])
    .default("brown")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OutfitAvatar = typeof outfitAvatars.$inferSelect;
export type InsertOutfitAvatar = typeof outfitAvatars.$inferInsert;

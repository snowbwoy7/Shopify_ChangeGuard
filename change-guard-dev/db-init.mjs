import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.DATABASE_URL || "file:./dev.sqlite",
});

const statements = [
  `CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY NOT NULL,
    shop TEXT NOT NULL,
    state TEXT NOT NULL,
    isOnline INTEGER NOT NULL DEFAULT 0,
    scope TEXT,
    expires TEXT,
    accessToken TEXT NOT NULL,
    userId TEXT,
    firstName TEXT,
    lastName TEXT,
    email TEXT,
    accountOwner INTEGER,
    locale TEXT,
    collaborator INTEGER,
    emailVerified INTEGER,
    refreshToken TEXT,
    refreshTokenExpires TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS session_shop_idx ON session(shop)`,
  `CREATE TABLE IF NOT EXISTS Operation (
    id TEXT PRIMARY KEY NOT NULL,
    shop TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    operationType TEXT NOT NULL,
    inputJson TEXT NOT NULL,
    planJson TEXT,
    planHash TEXT NOT NULL,
    approvalTokenHash TEXT,
    approvedAt TEXT,
    approvalExpiresAt TEXT,
    consumedAt TEXT,
    executionTokenHash TEXT,
    executionStartedAt TEXT,
    executionFailedAt TEXT,
    failureReason TEXT,
    executionAttempts INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    executedAt TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS Operation_shop_createdAt_idx ON Operation(shop, createdAt)`,
  `CREATE INDEX IF NOT EXISTS Operation_shop_status_idx ON Operation(shop, status)`,
  `CREATE INDEX IF NOT EXISTS Operation_planHash_idx ON Operation(planHash)`,
  `CREATE TABLE IF NOT EXISTS OperationEvent (
    id TEXT PRIMARY KEY NOT NULL,
    operationId TEXT NOT NULL,
    shop TEXT NOT NULL,
    eventType TEXT NOT NULL,
    metadataJson TEXT,
    createdAt TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS OperationEvent_operationId_createdAt_idx
    ON OperationEvent(operationId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS OperationEvent_shop_createdAt_idx
    ON OperationEvent(shop, createdAt)`,
  `CREATE TABLE IF NOT EXISTS Promotion (
    id TEXT PRIMARY KEY NOT NULL,
    shop TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    discountPercent TEXT NOT NULL,
    startAt TEXT NOT NULL,
    endAt TEXT NOT NULL,
    planJson TEXT NOT NULL,
    planHash TEXT NOT NULL,
    approvedAt TEXT,
    activatedAt TEXT,
    restoringAt TEXT,
    completedAt TEXT,
    failureReason TEXT,
    processingAttempts INTEGER NOT NULL DEFAULT 0,
    lastClaimedAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS Promotion_shop_status_idx ON Promotion(shop, status)`,
  `CREATE INDEX IF NOT EXISTS Promotion_status_startAt_endAt_idx ON Promotion(status, startAt, endAt)`,
  `CREATE INDEX IF NOT EXISTS Promotion_planHash_idx ON Promotion(planHash)`,
  `CREATE TABLE IF NOT EXISTS PromotionSnapshot (
    id TEXT PRIMARY KEY NOT NULL,
    promotionId TEXT NOT NULL,
    shop TEXT NOT NULL,
    productId TEXT NOT NULL,
    variantId TEXT NOT NULL,
    originalPrice TEXT NOT NULL,
    expectedPrice TEXT NOT NULL,
    restoredAt TEXT,
    conflictReason TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS PromotionSnapshot_promotionId_idx ON PromotionSnapshot(promotionId)`,
  `CREATE INDEX IF NOT EXISTS PromotionSnapshot_variantId_idx ON PromotionSnapshot(variantId)`,
];

for (const sql of statements) {
  await client.execute(sql);
}

// Upgrade databases created by earlier ChangeGuard Drizzle migrations.
// SQLite only permits ADD COLUMN for missing columns, so each statement is
// intentionally tolerant of an already-upgraded database.
const optionalSessionColumns = [
  ["firstName", "TEXT"],
  ["lastName", "TEXT"],
  ["email", "TEXT"],
  ["accountOwner", "INTEGER"],
  ["locale", "TEXT"],
  ["collaborator", "INTEGER"],
  ["emailVerified", "INTEGER"],
  ["refreshToken", "TEXT"],
  ["refreshTokenExpires", "TEXT"],
];

for (const [name, type] of optionalSessionColumns) {
  try {
    await client.execute(`ALTER TABLE session ADD COLUMN ${name} ${type}`);
  } catch (error) {
    if (!String(error).toLowerCase().includes("duplicate column")) {
      throw error;
    }
  }
}

console.log("ChangeGuard database schema is ready.");

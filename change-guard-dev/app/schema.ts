import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessionTable = sqliteTable("session" as string, {
  id: text("id").primaryKey(),
  shop: text("shop").notNull(),
  state: text("state").notNull(),
  isOnline: integer("isOnline", { mode: "boolean" }).notNull().default(false),
  scope: text("scope"),
  expires: text("expires"),
  accessToken: text("accessToken").notNull(),
  userId: blob("userId", { mode: "bigint" }),
  firstName: text("firstName"),
  lastName: text("lastName"),
  email: text("email"),
  accountOwner: integer("accountOwner", { mode: "boolean" }),
  locale: text("locale"),
  collaborator: integer("collaborator", { mode: "boolean" }),
  emailVerified: integer("emailVerified", { mode: "boolean" }),
  refreshToken: text("refreshToken"),
  refreshTokenExpires: text("refreshTokenExpires"),
});

export const operationTable = sqliteTable(
  "Operation",
  {
    id: text("id").primaryKey(),
    shop: text("shop").notNull(),
    status: text("status").notNull().default("draft"),
    operationType: text("operationType").notNull(),
    inputJson: text("inputJson").notNull(),
    planJson: text("planJson"),
    planHash: text("planHash").notNull(),
    approvalTokenHash: text("approvalTokenHash"),
    approvedAt: text("approvedAt"),
    approvalExpiresAt: text("approvalExpiresAt"),
    consumedAt: text("consumedAt"),
    executionTokenHash: text("executionTokenHash"),
    executionStartedAt: text("executionStartedAt"),
    executionFailedAt: text("executionFailedAt"),
    failureReason: text("failureReason"),
    executionAttempts: integer("executionAttempts").notNull().default(0),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
    executedAt: text("executedAt"),
  },
  (table) => ({
    shopCreatedAtIdx: index("Operation_shop_createdAt_idx").on(table.shop, table.createdAt),
    shopStatusIdx: index("Operation_shop_status_idx").on(table.shop, table.status),
    planHashIdx: index("Operation_planHash_idx").on(table.planHash),
  }),
);

export const operationEventTable = sqliteTable(
  "OperationEvent",
  {
    id: text("id").primaryKey(),
    operationId: text("operationId").notNull(),
    shop: text("shop").notNull(),
    eventType: text("eventType").notNull(),
    metadataJson: text("metadataJson"),
    createdAt: text("createdAt").notNull(),
  },
  (table) => ({
    operationCreatedAtIdx: index("OperationEvent_operationId_createdAt_idx").on(
      table.operationId,
      table.createdAt,
    ),
    shopCreatedAtIdx: index("OperationEvent_shop_createdAt_idx").on(
      table.shop,
      table.createdAt,
    ),
  }),
);

export const promotionTable = sqliteTable(
  "Promotion",
  {
    id: text("id").primaryKey(),
    shop: text("shop").notNull(),
    status: text("status").notNull().default("draft"),
    discountPercent: text("discountPercent").notNull(),
    startAt: text("startAt").notNull(),
    endAt: text("endAt").notNull(),
    planJson: text("planJson").notNull(),
    planHash: text("planHash").notNull(),
    approvedAt: text("approvedAt"),
    activatedAt: text("activatedAt"),
    restoringAt: text("restoringAt"),
    completedAt: text("completedAt"),
    failureReason: text("failureReason"),
    processingAttempts: integer("processingAttempts").notNull().default(0),
    lastClaimedAt: text("lastClaimedAt"),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
  },
  (table) => ({
    shopStatusIdx: index("Promotion_shop_status_idx").on(table.shop, table.status),
    scheduleIdx: index("Promotion_status_startAt_endAt_idx").on(
      table.status,
      table.startAt,
      table.endAt,
    ),
    planHashIdx: index("Promotion_planHash_idx").on(table.planHash),
  }),
);

export const promotionSnapshotTable = sqliteTable(
  "PromotionSnapshot",
  {
    id: text("id").primaryKey(),
    promotionId: text("promotionId").notNull(),
    shop: text("shop").notNull(),
    productId: text("productId").notNull(),
    variantId: text("variantId").notNull(),
    originalPrice: text("originalPrice").notNull(),
    expectedPrice: text("expectedPrice").notNull(),
    restoredAt: text("restoredAt"),
    conflictReason: text("conflictReason"),
  },
  (table) => ({
    promotionIdx: index("PromotionSnapshot_promotionId_idx").on(table.promotionId),
    variantIdx: index("PromotionSnapshot_variantId_idx").on(table.variantId),
  }),
);

export type OperationRow = typeof operationTable.$inferSelect;
export type PromotionRow = typeof promotionTable.$inferSelect;
export type PromotionSnapshotRow = typeof promotionSnapshotTable.$inferSelect;

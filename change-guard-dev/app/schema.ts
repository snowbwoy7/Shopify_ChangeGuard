import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessionTable = sqliteTable("session", {
  id: text("id").primaryKey(),
  shop: text("shop").notNull(),
  state: text("state").notNull(),
  isOnline: integer("isOnline", { mode: "boolean" }).notNull().default(false),
  scope: text("scope"),
  expires: text("expires"),
  accessToken: text("accessToken"),
  userId: blob("userId", { mode: "bigint" }),
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

export type OperationRow = typeof operationTable.$inferSelect;

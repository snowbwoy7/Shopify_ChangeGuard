-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "operationType" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "planJson" TEXT,
    "planHash" TEXT NOT NULL,
    "approvalTokenHash" TEXT,
    "approvedAt" DATETIME,
    "approvalExpiresAt" DATETIME,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "executedAt" DATETIME
);

CREATE INDEX "Operation_shop_createdAt_idx" ON "Operation"("shop", "createdAt");
CREATE INDEX "Operation_shop_status_idx" ON "Operation"("shop", "status");
CREATE INDEX "Operation_planHash_idx" ON "Operation"("planHash");

-- CreateTable
CREATE TABLE "OperationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OperationEvent_operationId_createdAt_idx" ON "OperationEvent"("operationId", "createdAt");
CREATE INDEX "OperationEvent_shop_createdAt_idx" ON "OperationEvent"("shop", "createdAt");

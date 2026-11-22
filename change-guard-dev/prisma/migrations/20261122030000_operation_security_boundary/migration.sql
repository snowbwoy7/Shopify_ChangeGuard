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

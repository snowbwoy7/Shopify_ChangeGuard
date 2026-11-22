-- Add execution authorization and recovery state
ALTER TABLE "Operation" ADD COLUMN "executionTokenHash" TEXT;
ALTER TABLE "Operation" ADD COLUMN "executionStartedAt" DATETIME;
ALTER TABLE "Operation" ADD COLUMN "executionFailedAt" DATETIME;
ALTER TABLE "Operation" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "Operation" ADD COLUMN "executionAttempts" INTEGER NOT NULL DEFAULT 0;

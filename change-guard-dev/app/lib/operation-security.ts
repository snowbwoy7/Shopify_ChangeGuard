import { createHash, randomUUID } from "node:crypto";
import type { ChangePlan, PriceChangeInput } from "./change-plan";

export const MAX_APPROVAL_VARIANTS = 5_000;
export const APPROVAL_TTL_MS = 15 * 60 * 1000;

export type OperationStatus =
  | "draft"
  | "approved"
  | "consumed"
  | "executed"
  | "failed"
  | "expired";

export type OperationInput = {
  operation: PriceChangeInput["operation"];
  value: number;
  scope: string;
  scopeValue: string;
};

export type StoredOperation = {
  id: string;
  shop: string;
  status: OperationStatus;
  operationType: "price_change";
  input: OperationInput;
  plan: ChangePlan;
  planHash: string;
  createdAt: string;
  approvalExpiresAt: string | null;
};

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, nested) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.keys(nested)
          .sort()
          .reduce<Record<string, unknown>>((result, key) => {
            result[key] = nested[key];
            return result;
          }, {})
      : nested,
  );
}

export function hashPlan(plan: ChangePlan): string {
  return createHash("sha256").update(canonicalJson(plan)).digest("hex");
}

export function createOperationDraft(
  shop: string,
  input: OperationInput,
  plan: ChangePlan,
): StoredOperation {
  if (!shop) {
    throw new Error("Authenticated Shopify shop is required.");
  }

  if (plan.variantsScanned > MAX_APPROVAL_VARIANTS) {
    throw new Error(
      `This plan scans ${plan.variantsScanned.toLocaleString()} variants. Approval is limited to ${MAX_APPROVAL_VARIANTS.toLocaleString()} variants in V1.`,
    );
  }

  return {
    id: randomUUID(),
    shop,
    status: "draft",
    operationType: "price_change",
    input,
    plan,
    planHash: hashPlan(plan),
    createdAt: new Date().toISOString(),
    approvalExpiresAt: null,
  };
}

export function assertOperationOwnership(
  operation: { shop: string; status: OperationStatus },
  authenticatedShop: string,
): void {
  if (!authenticatedShop || operation.shop !== authenticatedShop) {
    throw new Error("Operation does not belong to the authenticated Shopify shop.");
  }

  if (operation.status !== "draft" && operation.status !== "approved") {
    throw new Error("Operation is not available for this transition.");
  }
}

export function createApprovalTokenHash(
  operationId: string,
  planHash: string,
  secret: string,
): string {
  return createHash("sha256")
    .update(`${operationId}:${planHash}:${secret}`)
    .digest("hex");
}

export function createApprovalExpiry(now = new Date()): string {
  return new Date(now.getTime() + APPROVAL_TTL_MS).toISOString();
}

export function assertApprovalFresh(
  status: OperationStatus,
  approvalExpiresAt: string | null,
  now = new Date(),
): void {
  if (status !== "approved") {
    throw new Error("Operation has not been approved.");
  }

  if (
    !approvalExpiresAt ||
    new Date(approvalExpiresAt).getTime() <= now.getTime()
  ) {
    throw new Error("Operation approval has expired.");
  }
}

export type ExecutionAuthorization = {
  operationId: string;
  planHash: string;
  executionTokenHash: string;
};

export function createExecutionAuthorization(
  operationId: string,
  planHash: string,
  secret: string,
): ExecutionAuthorization {
  if (!operationId || !planHash || !secret) {
    throw new Error("Execution authorization requires a valid operation context.");
  }

  const executionToken = randomUUID();
  const executionTokenHash = createHash("sha256")
    .update(`${operationId}:${planHash}:${executionToken}:${secret}`)
    .digest("hex");

  return {
    operationId,
    planHash,
    executionTokenHash,
  };
}

export function createExecutionToken(
  operationId: string,
  planHash: string,
  secret: string,
): string {
  if (!operationId || !planHash || !secret) {
    throw new Error("Execution token requires a valid operation context.");
  }

  return createHash("sha256")
    .update(`${operationId}:${planHash}:${secret}`)
    .digest("hex");
}

export function createExecutionTokenHash(
  operationId: string,
  planHash: string,
  executionToken: string,
  secret: string,
): string {
  return createHash("sha256")
    .update(`${operationId}:${planHash}:${executionToken}:${secret}`)
    .digest("hex");
}

import { createHash, randomUUID } from "node:crypto";
import type { ChangePlan, PriceChangeInput } from "./change-plan";

export const MAX_APPROVAL_VARIANTS = 5_000;
export const APPROVAL_TTL_MS = 15 * 60 * 1000;\nexport const EXECUTION_TOKEN_BYTES = 32;

export type OperationStatus = "draft" | "approved" | "consumed" | "executed" | "failed" | "expired";

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

  if (!approvalExpiresAt || new Date(approvalExpiresAt).getTime() <= now.getTime()) {
    throw new Error("Operation approval has expired.");
  }
}


export type ExecutionAuthorization = {
  operationId: string;
  shop: string;
  planHash: string;
  executionToken: string;
  executionTokenHash: string;
};

export function createExecutionAuthorization(
  operationId: string,
  shop: string,
  planHash: string,
  secret: string,
): ExecutionAuthorization {
  if (!operationId || !shop || !planHash || !secret) {
    throw new Error("Execution authorization requires an authenticated operation context.");
  }

  const executionToken = Buffer.from(
    randomUUID() + randomUUID(),
  ).toString("base64url");
  const executionTokenHash = createHash("sha256")
    .update(`${operationId}:${planHash}:${executionToken}:${secret}`)
    .digest("hex");

  return {
    operationId,
    shop,
    planHash,
    executionToken,
    executionTokenHash,
  };
}

export function assertExecutionAuthorization(
  operation: {
    shop: string;
    status: OperationStatus;
    planHash: string;
    approvalTokenHash: string | null;
    approvalExpiresAt: Date | string | null;
    executionTokenHash: string | null;
  },
  authenticatedShop: string,
  expectedPlanHash: string,
  operationId: string,
  expectedExecutionToken: string,
  secret: string,
  now = new Date(),
): void {
  if (!authenticatedShop || operation.shop !== authenticatedShop) {
    throw new Error("Operation does not belong to the authenticated Shopify shop.");
  }

  if (operation.status !== "approved") {
    throw new Error("Only an approved operation can enter execution.");
  }

  if (operation.planHash !== expectedPlanHash) {
    throw new Error("Operation plan hash does not match the approved plan.");
  }

  assertApprovalFresh(
    operation.status,
    operation.approvalExpiresAt
      ? new Date(operation.approvalExpiresAt).toISOString()
      : null,
    now,
  );

  if (!operation.approvalTokenHash) {
    throw new Error("Operation approval proof is missing.");
  }

  if (!operation.executionTokenHash) {
    throw new Error("Execution authorization has not been issued.");
  }

  const executionHash = createHash("sha256")
    .update(`${operationId}:${operation.planHash}:${expectedExecutionToken}:${secret}`)
    .digest("hex");

  if (executionHash !== operation.executionTokenHash) {
    throw new Error("Execution authorization is invalid.");
  }
}

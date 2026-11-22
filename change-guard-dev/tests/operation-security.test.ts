import assert from "node:assert/strict";
import {
  MAX_APPROVAL_VARIANTS,
  assertApprovalFresh,
  createApprovalExpiry,
  createApprovalTokenHash,
  createOperationDraft,
  hashPlan,
} from "../app/lib/operation-security";

const plan = {
  operation: "percentage" as const,
  value: 10,
  recordsScanned: 1,
  variantsScanned: 1,
  variantsToChange: 1,
  unchanged: 0,
  errors: 0,
  preview: [
    {
      productId: "product-1",
      productTitle: "Shoe",
      variantId: "variant-1",
      variantTitle: "Default",
      before: "100.00",
      after: "110.00",
      status: "change" as const,
    },
  ],
};

const hash = hashPlan(plan);
assert.equal(hash, hashPlan(plan));
assert.notEqual(
  hash,
  hashPlan({ ...plan, value: 11 }),
);

const tokenA = createApprovalTokenHash("operation-1", hash, "secret");
const tokenB = createApprovalTokenHash("operation-1", hash, "secret");
const tokenC = createApprovalTokenHash("operation-2", hash, "secret");

assert.equal(tokenA, tokenB);
assert.notEqual(tokenA, tokenC);

const now = new Date("2026-11-22T00:00:00.000Z");
const expiry = createApprovalExpiry(now);
assert.equal(expiry, "2026-11-22T00:15:00.000Z");

assert.doesNotThrow(() =>
  assertApprovalFresh("approved", expiry, new Date("2026-11-22T00:14:59.999Z")),
);
assert.throws(
  () => assertApprovalFresh("approved", expiry, new Date("2026-11-22T00:15:00.000Z")),
  /expired/,
);
assert.throws(
  () => assertApprovalFresh("draft", expiry, now),
  /not been approved/,
);

const draft = createOperationDraft(
  "example.myshopify.com",
  {
    operation: "percentage",
    value: 10,
    scope: "all",
    scopeValue: "",
  },
  plan,
);
assert.equal(draft.shop, "example.myshopify.com");
assert.equal(draft.status, "draft");
assert.equal(draft.planHash, hash);

assert.throws(
  () =>
    createOperationDraft(
      "example.myshopify.com",
      { operation: "percentage", value: 10, scope: "all", scopeValue: "" },
      { ...plan, variantsScanned: MAX_APPROVAL_VARIANTS + 1 },
    ),
  /Approval is limited/,
);

console.log("operation-security tests passed");

import assert from "node:assert/strict";
import { executePriceChangePlan } from "../app/lib/price-operation-executor";

function response(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
}

function createAdmin(responses: unknown[]) {
  let index = 0;
  const queries: string[] = [];

  return {
    queries,
    graphql: async (query: string) => {
      queries.push(query);
      const payload = responses[index++];

      if (payload === undefined) {
        throw new Error("Unexpected GraphQL call.");
      }

      return response(payload);
    },
  };
}

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
      productId: "gid://shopify/Product/1",
      productTitle: "Shoe",
      variantId: "gid://shopify/ProductVariant/1",
      variantTitle: "Default",
      before: "100.00",
      after: "110.00",
      status: "change" as const,
    },
  ],
};

const successAdmin = createAdmin([
  {
    data: {
      product: {
        id: "gid://shopify/Product/1",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", price: "100.00" }] },
      },
    },
  },
  {
    data: {
      productVariantsBulkUpdate: { userErrors: [] },
    },
  },
  {
    data: {
      product: {
        id: "gid://shopify/Product/1",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", price: "110.00" }] },
      },
    },
  },
]);

const success = await executePriceChangePlan(successAdmin, plan);
assert.deepEqual(success, {
  attempted: 1,
  applied: 1,
  alreadyApplied: 0,
  conflicts: 0,
  errors: [],
  issues: [],
  appliedVariantIds: ["gid://shopify/ProductVariant/1"],
  alreadyAppliedVariantIds: [],
});
assert.equal(successAdmin.queries.length, 3);

const verificationFailureAdmin = createAdmin([
  {
    data: {
      product: {
        id: "gid://shopify/Product/1",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", price: "100.00" }] },
      },
    },
  },
  {
    data: {
      productVariantsBulkUpdate: { userErrors: [] },
    },
  },
  {
    data: {
      product: {
        id: "gid://shopify/Product/1",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", price: "105.00" }] },
      },
    },
  },
]);

await assert.rejects(
  () => executePriceChangePlan(verificationFailureAdmin, plan),
  /post-write verification failed/,
);
assert.equal(verificationFailureAdmin.queries.length, 3);

const conflictAdmin = createAdmin([
  {
    data: {
      product: {
        id: "gid://shopify/Product/1",
        variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", price: "101.00" }] },
      },
    },
  },
]);

await assert.rejects(
  () => executePriceChangePlan(conflictAdmin, plan),
  /Execution stopped safely/,
);
assert.equal(conflictAdmin.queries.length, 1);

console.log("price-operation-executor tests passed");

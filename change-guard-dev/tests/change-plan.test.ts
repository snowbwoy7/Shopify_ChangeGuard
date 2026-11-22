import assert from "node:assert/strict";
import { calculateNewPrice, buildPriceChangePlan } from "../app/lib/change-plan";

const percentage = calculateNewPrice("100.00", {
  operation: "percentage",
  value: 10,
});
assert.deepEqual(percentage, { after: "110.00" });

const fixed = calculateNewPrice("19.99", {
  operation: "fixed",
  value: 5.01,
});
assert.deepEqual(fixed, { after: "25.00" });

const negative = calculateNewPrice("10.00", {
  operation: "fixed",
  value: -11,
});
assert.deepEqual(negative, {
  error: "The change would produce a negative price.",
});

const plan = buildPriceChangePlan(
  [
    {
      id: "gid://shopify/Product/1",
      title: "Shoe",
      handle: "shoe",
      status: "ACTIVE",
      vendor: "Acme",
      productType: "Shoes",
      tags: ["sale"],
      variants: [
        {
          id: "gid://shopify/ProductVariant/1",
          title: "Default",
          price: "100.00",
        },
        {
          id: "gid://shopify/ProductVariant/2",
          title: "Discounted",
          price: "100.00",
        },
      ],
    },
  ],
  { operation: "percentage", value: 10 },
);

assert.equal(plan.recordsScanned, 1);
assert.equal(plan.variantsScanned, 2);
assert.equal(plan.variantsToChange, 2);
assert.equal(plan.unchanged, 0);
assert.equal(plan.errors, 0);
assert.deepEqual(
  plan.preview.map((item) => ({ before: item.before, after: item.after, status: item.status })),
  [
    { before: "100.00", after: "110.00", status: "change" },
    { before: "100.00", after: "110.00", status: "change" },
  ],
);

console.log("change-plan tests passed");

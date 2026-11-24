import assert from "node:assert/strict";
import {
  buildPromotionPlan,
  calculatePromotionalPrice,
  validatePromotionInput,
} from "../app/lib/promotion-plan";

const startAt = "2026-11-25T10:00:00.000Z";
const endAt = "2026-11-28T10:00:00.000Z";
const now = new Date("2026-11-24T10:00:00.000Z");

assert.deepEqual(calculatePromotionalPrice("100.00", 20), {
  after: "80.00",
});

assert.deepEqual(calculatePromotionalPrice("19.99", 33.333), {
  after: "13.33",
});

assert.deepEqual(calculatePromotionalPrice("100.00", 100), {
  after: "0.00",
});

assert.deepEqual(
  validatePromotionInput(
    { discountPercent: 20, startAt, endAt },
    now,
  ),
  null,
);

assert.equal(
  validatePromotionInput(
    { discountPercent: -1, startAt, endAt },
    now,
  ),
  "Discount percentage must be between 0 and 100.",
);

assert.equal(
  validatePromotionInput(
    {
      discountPercent: 20,
      startAt: "2026-11-25T10:00:00.000Z",
      endAt: "2026-11-25T09:00:00.000Z",
    },
    now,
  ),
  "Promotion end time must be after the start time.",
);

const plan = buildPromotionPlan(
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
          title: "Special",
          price: "19.99",
        },
      ],
    },
  ],
  { discountPercent: 20, startAt, endAt },
  now,
);

assert.equal(plan.recordsScanned, 1);
assert.equal(plan.variantsScanned, 2);
assert.equal(plan.variantsToChange, 2);
assert.equal(plan.unchanged, 0);
assert.equal(plan.errors, 0);
assert.equal(plan.startAt, startAt);
assert.equal(plan.endAt, endAt);
assert.deepEqual(
  plan.preview.map((item) => ({
    originalPrice: item.originalPrice,
    promotionalPrice: item.promotionalPrice,
    status: item.status,
  })),
  [
    { originalPrice: "100.00", promotionalPrice: "80.00", status: "change" },
    { originalPrice: "19.99", promotionalPrice: "15.99", status: "change" },
  ],
);

console.log("promotion-plan tests passed");

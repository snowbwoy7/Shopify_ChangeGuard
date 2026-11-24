import assert from "node:assert/strict";
import {
  buildPromotionRestoreTargets,
  buildPromotionStartTargets,
} from "../app/lib/promotion-executor";

const snapshots = [
  {
    id: "snapshot-1",
    promotionId: "promotion-1",
    shop: "example.myshopify.com",
    productId: "gid://shopify/Product/1",
    variantId: "gid://shopify/ProductVariant/1",
    originalPrice: "100.00",
    expectedPrice: "80.00",
    restoredAt: null,
    conflictReason: null,
  },
];

assert.deepEqual(buildPromotionStartTargets(snapshots), [
  {
    productId: "gid://shopify/Product/1",
    productTitle: "gid://shopify/Product/1",
    variantId: "gid://shopify/ProductVariant/1",
    variantTitle: "gid://shopify/ProductVariant/1",
    expectedCurrentPrice: "100.00",
    targetPrice: "80.00",
  },
]);

assert.deepEqual(buildPromotionRestoreTargets(snapshots), [
  {
    productId: "gid://shopify/Product/1",
    productTitle: "gid://shopify/Product/1",
    variantId: "gid://shopify/ProductVariant/1",
    variantTitle: "gid://shopify/ProductVariant/1",
    expectedCurrentPrice: "80.00",
    targetPrice: "100.00",
  },
]);

assert.equal(
  buildPromotionRestoreTargets([
    {
      ...snapshots[0],
      restoredAt: "2026-11-28T10:00:01.000Z",
    },
  ]).length,
  0,
);

assert.equal(
  buildPromotionRestoreTargets([
    {
      ...snapshots[0],
      conflictReason: "Merchant changed price during campaign.",
    },
  ]).length,
  0,
);

console.log("promotion-executor tests passed");

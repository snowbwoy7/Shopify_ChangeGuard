import { createHash } from "node:crypto";
import type { ProductSnapshot } from "./change-plan";

export type PromotionInput = {
  discountPercent: number;
  startAt: string;
  endAt: string;
};

export type PromotionPreviewItem = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
  originalPrice: string;
  promotionalPrice: string | null;
  status: "change" | "unchanged" | "error";
  message?: string;
};

export type PromotionPlan = {
  discountPercent: number;
  startAt: string;
  endAt: string;
  recordsScanned: number;
  variantsScanned: number;
  variantsToChange: number;
  unchanged: number;
  errors: number;
  preview: PromotionPreviewItem[];
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}

export function hashPromotionPlan(plan: PromotionPlan): string {
  return createHash("sha256")
    .update(JSON.stringify(plan))
    .digest("hex");
}

export function validatePromotionInput(
  input: PromotionInput,
  now = new Date(),
): string | null {
  if (!Number.isFinite(input.discountPercent)) {
    return "Discount percentage must be a finite number.";
  }

  if (input.discountPercent < 0 || input.discountPercent > 100) {
    return "Discount percentage must be between 0 and 100.";
  }

  const start = new Date(input.startAt);
  const end = new Date(input.endAt);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return "Promotion start and end times must be valid dates.";
  }

  if (start.getTime() <= now.getTime()) {
    return "Promotion start time must be in the future.";
  }

  if (end.getTime() <= start.getTime()) {
    return "Promotion end time must be after the start time.";
  }

  return null;
}

export function calculatePromotionalPrice(
  originalPrice: string,
  discountPercent: number,
): { after: string } | { error: string } {
  const current = Number(originalPrice);

  if (!Number.isFinite(current) || current < 0) {
    return { error: "Original price is invalid." };
  }

  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return { error: "Discount percentage must be between 0 and 100." };
  }

  const next = current * (1 - discountPercent / 100);

  if (!Number.isFinite(next) || next < 0) {
    return { error: "The discount would produce an invalid price." };
  }

  return { after: formatMoney(next) };
}

export function buildPromotionPlan(
  products: ProductSnapshot[],
  input: PromotionInput,
  now = new Date(),
): PromotionPlan {
  const validationError = validatePromotionInput(input, now);
  if (validationError) {
    throw new Error(validationError);
  }

  const preview: PromotionPreviewItem[] = [];

  for (const product of products) {
    for (const variant of product.variants) {
      const originalPrice = formatMoney(Number(variant.price));
      const result = calculatePromotionalPrice(
        originalPrice,
        input.discountPercent,
      );

      if ("error" in result) {
        preview.push({
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          variantTitle: variant.title,
          originalPrice,
          promotionalPrice: null,
          status: "error",
          message: result.error,
        });
        continue;
      }

      const unchanged = result.after === originalPrice;

      preview.push({
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantTitle: variant.title,
        originalPrice,
        promotionalPrice: result.after,
        status: unchanged ? "unchanged" : "change",
      });
    }
  }

  return {
    discountPercent: input.discountPercent,
    startAt: new Date(input.startAt).toISOString(),
    endAt: new Date(input.endAt).toISOString(),
    recordsScanned: products.length,
    variantsScanned: preview.length,
    variantsToChange: preview.filter((item) => item.status === "change").length,
    unchanged: preview.filter((item) => item.status === "unchanged").length,
    errors: preview.filter((item) => item.status === "error").length,
    preview,
  };
}

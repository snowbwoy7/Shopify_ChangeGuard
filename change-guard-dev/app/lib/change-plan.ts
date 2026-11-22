export type PriceOperation = "percentage" | "fixed";

export type PriceChangeInput = {
  operation: PriceOperation;
  value: number;
};

export type VariantSnapshot = {
  id: string;
  title: string;
  price: string;
};

export type ProductSnapshot = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  variants: VariantSnapshot[];
};

export type PreviewItem = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
  before: string;
  after: string | null;
  status: "change" | "unchanged" | "error";
  message?: string;
};

export type ChangePlan = {
  operation: PriceOperation;
  value: number;
  recordsScanned: number;
  variantsScanned: number;
  variantsToChange: number;
  unchanged: number;
  errors: number;
  preview: PreviewItem[];
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}

export function calculateNewPrice(
  currentPrice: string,
  input: PriceChangeInput,
): { after: string } | { error: string } {
  const current = Number(currentPrice);

  if (!Number.isFinite(current) || current < 0) {
    return { error: "Current price is invalid." };
  }

  if (!Number.isFinite(input.value)) {
    return { error: "Change value must be a finite number." };
  }

  const next =
    input.operation === "percentage"
      ? current * (1 + input.value / 100)
      : current + input.value;

  if (!Number.isFinite(next) || next < 0) {
    return { error: "The change would produce a negative price." };
  }

  return { after: formatMoney(next) };
}

export function buildPriceChangePlan(
  products: ProductSnapshot[],
  input: PriceChangeInput,
): ChangePlan {
  const preview: PreviewItem[] = [];

  for (const product of products) {
    for (const variant of product.variants) {
      const result = calculateNewPrice(variant.price, input);

      if ("error" in result) {
        preview.push({
          productId: product.id,
          productTitle: product.title,
          variantId: variant.id,
          variantTitle: variant.title,
          before: variant.price,
          after: null,
          status: "error",
          message: result.error,
        });
        continue;
      }

      const before = formatMoney(Number(variant.price));
      const unchanged = result.after === before;

      preview.push({
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantTitle: variant.title,
        before,
        after: result.after,
        status: unchanged ? "unchanged" : "change",
      });
    }
  }

  return {
    operation: input.operation,
    value: input.value,
    recordsScanned: products.length,
    variantsScanned: preview.length,
    variantsToChange: preview.filter((item) => item.status === "change").length,
    unchanged: preview.filter((item) => item.status === "unchanged").length,
    errors: preview.filter((item) => item.status === "error").length,
    preview,
  };
}

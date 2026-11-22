import type { ChangePlan, PreviewItem } from "./change-plan";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ExecutionResult = {
  attempted: number;
  applied: number;
  alreadyApplied: number;
  conflicts: number;
  errors: string[];
};

type CurrentVariant = {
  id: string;
  price: string;
};

type CurrentProduct = {
  id: string;
  variants: {
    nodes: CurrentVariant[];
  };
};

function money(value: string): number {
  return Number(value);
}

function normalizePrice(value: string): string {
  const parsed = money(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Shopify returned an invalid variant price.");
  }

  return parsed.toFixed(2);
}

async function readCurrentVariants(
  admin: AdminGraphqlClient,
  productId: string,
  variantIds: string[],
): Promise<Map<string, string>> {
  const response = await admin.graphql(
    `#graphql
      query ChangeGuardCurrentVariants($id: ID!) {
        product(id: $id) {
          id
          variants(first: 2048) {
            nodes {
              id
              price
            }
          }
        }
      }`,
    { variables: { id: productId } },
  );

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(
      payload.errors.map((error: { message: string }) => error.message).join("; "),
    );
  }

  const product = payload.data?.product as CurrentProduct | null;

  if (!product) {
    throw new Error(`Product ${productId} was not found.`);
  }

  const requested = new Set(variantIds);
  return new Map(
    product.variants.nodes
      .filter((variant) => requested.has(variant.id))
      .map((variant) => [variant.id, normalizePrice(variant.price)]),
  );
}

async function updateProductVariants(
  admin: AdminGraphqlClient,
  productId: string,
  variants: Array<{ id: string; price: string }>,
): Promise<void> {
  const response = await admin.graphql(
    `#graphql
      mutation ChangeGuardUpdatePrices(
        $productId: ID!,
        $variants: [ProductVariantsBulkInput!]!
      ) {
        productVariantsBulkUpdate(
          productId: $productId
          variants: $variants
          allowPartialUpdates: false
        ) {
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        productId,
        variants,
      },
    },
  );

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(
      payload.errors.map((error: { message: string }) => error.message).join("; "),
    );
  }

  const userErrors = payload.data?.productVariantsBulkUpdate?.userErrors ?? [];

  if (userErrors.length) {
    throw new Error(
      userErrors
        .map(
          (error: { field?: string[]; message: string }) =>
            `${error.field?.join(".") ?? "mutation"}: ${error.message}`,
        )
        .join("; "),
    );
  }
}

export async function executePriceChangePlan(
  admin: AdminGraphqlClient,
  plan: ChangePlan,
): Promise<ExecutionResult> {
  const changes = plan.preview.filter(
    (item: PreviewItem): item is PreviewItem & { after: string } =>
      item.status === "change" && item.after !== null,
  );

  const byProduct = new Map<string, typeof changes>();

  for (const item of changes) {
    const existing = byProduct.get(item.productId) ?? [];
    existing.push(item);
    byProduct.set(item.productId, existing);
  }

  const result: ExecutionResult = {
    attempted: changes.length,
    applied: 0,
    alreadyApplied: 0,
    conflicts: 0,
    errors: [],
  };

  for (const [productId, items] of byProduct) {
    try {
      const current = await readCurrentVariants(
        admin,
        productId,
        items.map((item) => item.variantId),
      );

      const toUpdate: Array<{ id: string; price: string }> = [];

      for (const item of items) {
        const actual = current.get(item.variantId);

        if (!actual) {
          result.conflicts += 1;
          result.errors.push(
            `${item.productTitle} / ${item.variantTitle}: variant no longer exists.`,
          );
          continue;
        }

        if (actual === item.after) {
          result.alreadyApplied += 1;
          continue;
        }

        if (actual !== item.before) {
          result.conflicts += 1;
          result.errors.push(
            `${item.productTitle} / ${item.variantTitle}: current price ${actual} differs from approved before-price ${item.before}.`,
          );
          continue;
        }

        toUpdate.push({
          id: item.variantId,
          price: item.after,
        });
      }

      if (toUpdate.length === 0) continue;

      await updateProductVariants(admin, productId, toUpdate);
      result.applied += toUpdate.length;
    } catch (error) {
      result.errors.push(
        error instanceof Error
          ? `Product ${productId}: ${error.message}`
          : `Product ${productId}: unknown execution error.`,
      );
    }
  }

  if (result.conflicts > 0 || result.errors.length > 0) {
    throw new Error(
      `Execution stopped safely: ${result.applied} applied, ${result.alreadyApplied} already applied, ${result.conflicts} conflicts, ${result.errors.length} errors. ${result.errors.slice(0, 5).join(" | ")}`,
    );
  }

  return result;
}

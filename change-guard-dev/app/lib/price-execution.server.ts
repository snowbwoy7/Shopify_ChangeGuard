type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type PriceTarget = {
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
  expectedCurrentPrice: string;
  targetPrice: string;
};

export type PriceExecutionIssue = {
  variantId?: string;
  kind: "conflict" | "error";
  message: string;
};

export type PriceExecutionResult = {
  attempted: number;
  applied: number;
  alreadyApplied: number;
  conflicts: number;
  errors: string[];
  issues: PriceExecutionIssue[];
  appliedVariantIds: string[];
  alreadyAppliedVariantIds: string[];
};

type CurrentProduct = {
  id: string;
  variants: {
    nodes: Array<{ id: string; price: string }>;
  };
};

type ExecutePriceTargetsOptions = {
  throwOnError?: boolean;
};

function normalizePrice(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Shopify returned an invalid variant price.");
  }

  return parsed.toFixed(2);
}

export async function readCurrentVariantPrices(
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

export async function updateProductVariantPrices(
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

export async function executePriceTargets(
  admin: AdminGraphqlClient,
  targets: PriceTarget[],
  options: ExecutePriceTargetsOptions = {},
): Promise<PriceExecutionResult> {
  const byProduct = new Map<string, PriceTarget[]>();

  for (const target of targets) {
    const existing = byProduct.get(target.productId) ?? [];
    existing.push(target);
    byProduct.set(target.productId, existing);
  }

  const result: PriceExecutionResult = {
    attempted: targets.length,
    applied: 0,
    alreadyApplied: 0,
    conflicts: 0,
    errors: [],
    issues: [],
    appliedVariantIds: [],
    alreadyAppliedVariantIds: [],
  };

  for (const [productId, items] of byProduct) {
    try {
      const current = await readCurrentVariantPrices(
        admin,
        productId,
        items.map((item) => item.variantId),
      );

      const toUpdate: Array<{ id: string; price: string }> = [];

      for (const item of items) {
        const actual = current.get(item.variantId);

        if (!actual) {
          const message = `${item.productTitle} / ${item.variantTitle}: variant no longer exists.`;
          result.conflicts += 1;
          result.errors.push(message);
          result.issues.push({
            variantId: item.variantId,
            kind: "conflict",
            message,
          });
          continue;
        }

        if (actual === item.targetPrice) {
          result.alreadyApplied += 1;
          result.alreadyAppliedVariantIds.push(item.variantId);
          continue;
        }

        if (actual !== item.expectedCurrentPrice) {
          const message = `${item.productTitle} / ${item.variantTitle}: current price ${actual} differs from approved expected price ${item.expectedCurrentPrice}.`;
          result.conflicts += 1;
          result.errors.push(message);
          result.issues.push({
            variantId: item.variantId,
            kind: "conflict",
            message,
          });
          continue;
        }

        toUpdate.push({ id: item.variantId, price: item.targetPrice });
      }

      if (toUpdate.length === 0) continue;

      await updateProductVariantPrices(admin, productId, toUpdate);

      const verified = await readCurrentVariantPrices(
        admin,
        productId,
        toUpdate.map((item) => item.id),
      );

      for (const item of toUpdate) {
        const actualAfter = verified.get(item.id);

        if (actualAfter !== item.price) {
          const message = `Product ${productId}, variant ${item.id}: post-write verification failed. Expected ${item.price}, Shopify returned ${actualAfter ?? "missing"}.`;
          result.errors.push(message);
          result.issues.push({
            variantId: item.id,
            kind: "error",
            message,
          });
          throw new Error(message);
        }
      }

      result.applied += toUpdate.length;
      result.appliedVariantIds.push(...toUpdate.map((item) => item.id));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown execution error.";

      if (!result.errors.some((item) => item.includes(message))) {
        result.errors.push(`Product ${productId}: ${message}`);
      }

      for (const item of items) {
        if (!result.issues.some((issue) => issue.variantId === item.variantId)) {
          result.issues.push({
            variantId: item.variantId,
            kind: "error",
            message: `Product ${productId}: ${message}`,
          });
        }
      }
    }
  }

  if (
    options.throwOnError !== false &&
    (result.conflicts > 0 || result.errors.length > 0)
  ) {
    throw new Error(
      `Execution stopped safely: ${result.applied} applied, ${result.alreadyApplied} already applied, ${result.conflicts} conflicts, ${result.errors.length} errors. ${result.errors.slice(0, 5).join(" | ")}`,
    );
  }

  return result;
}

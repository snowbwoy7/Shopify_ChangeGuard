import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { listApprovedOperations, createOperationWithEvent } from "../lib/operation-store.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  buildPriceChangePlan,
  type ProductSnapshot,
} from "../lib/change-plan";
import { createOperationDraft } from "../lib/operation-security";

const MAX_SCAN_PRODUCTS = 10_000;

function escapeSearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildProductQuery(formData: FormData): string | undefined {
  const scope = String(formData.get("scope") ?? "all");
  const value = String(formData.get("scopeValue") ?? "").trim();

  if (scope === "all" || !value) return undefined;

  const escaped = escapeSearchValue(value);

  switch (scope) {
    case "collection":
      return `collection_id:${escaped}`;
    case "product_type":
      return `product_type:"${escaped}"`;
    case "vendor":
      return `vendor:"${escaped}"`;
    case "tag":
      return `tag:"${escaped}"`;
    case "status":
      return `status:${escaped.toLowerCase()}`;
    default:
      return undefined;
  }
}

type ShopifyProductsPayload = {
  data?: {
    products?: {
      edges: Array<{
        cursor: string;
        node: {
          id: string;
          title: string;
          handle: string;
          status: string;
          vendor: string;
          productType: string;
          tags: string[];
          variants: {
            nodes: Array<{ id: string; title: string; price: string }>;
          };
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
};

async function readProducts(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  query: string | undefined,
): Promise<ProductSnapshot[]> {
  const products: ProductSnapshot[] = [];
  let cursor: string | null = null;

  while (products.length < MAX_SCAN_PRODUCTS) {
    const response = await admin.graphql(
      `#graphql
        query ChangeGuardProducts($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query, sortKey: ID) {
            edges {
              cursor
              node {
                id
                title
                handle
                status
                vendor
                productType
                tags
                variants(first: 250) {
                  nodes {
                    id
                    title
                    price
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`,
      {
        variables: {
          first: 250,
          after: cursor,
          query,
        },
      },
    );

    const payload = (await response.json()) as ShopifyProductsPayload;

    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error: { message: string }) => error.message).join("; "));
    }

    const connection = payload.data?.products;

    if (!connection) {
      throw new Error("Shopify did not return product data.");
    }

    for (const edge of connection.edges) {
      products.push({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        status: edge.node.status,
        vendor: edge.node.vendor,
        productType: edge.node.productType,
        tags: edge.node.tags,
        variants: edge.node.variants.nodes.map(
          (variant: { id: string; title: string; price: string }) => ({
            id: variant.id,
            title: variant.title,
            price: variant.price,
          }),
        ),
      });

      if (products.length >= MAX_SCAN_PRODUCTS) break;
    }

    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;

    if (!cursor) break;
  }

  return products;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const approvedOperations = await listApprovedOperations(session.shop);

  return { approvedOperations };
};

type ChangePlanActionData =
  | {
      ok: true;
      operationId: string;
      planHash: string;
      plan: ReturnType<typeof buildPriceChangePlan>;
      capped: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export const action = async ({ request }: ActionFunctionArgs): Promise<ChangePlanActionData> => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const operation = String(formData.get("operation") ?? "percentage");
  const value = Number(formData.get("value"));
  const scope = String(formData.get("scope") ?? "all");
  const scopeValue = String(formData.get("scopeValue") ?? "").trim();

  if (operation !== "percentage" && operation !== "fixed") {
    return { ok: false, error: "Unsupported price operation." };
  }

  if (!Number.isFinite(value)) {
    return { ok: false, error: "Enter a valid numeric change value." };
  }

  if (scope !== "all" && !scopeValue) {
    return { ok: false, error: "Enter a value for the selected scope." };
  }

  try {
    const products = await readProducts(admin, buildProductQuery(formData));
    const plan = buildPriceChangePlan(products, {
      operation,
      value,
    });

    const operationDraft = createOperationDraft(session.shop, {
      operation,
      value,
      scope,
      scopeValue,
    }, plan);

    await createOperationWithEvent(
      operationDraft,
      {
        planHash: operationDraft.planHash,
        variantsScanned: plan.variantsScanned,
      },
    );

    return {
      ok: true,
      operationId: operationDraft.id,
      planHash: operationDraft.planHash,
      plan,
      capped: products.length >= MAX_SCAN_PRODUCTS,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to build the change plan.",
    };
  }
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const loaderData = useLoaderData<typeof loader>();
  const actionData = fetcher.data;
  const plan = actionData?.ok ? actionData.plan : null;
  const isLoading = fetcher.state !== "idle";

  return (
    <s-page heading="ChangeGuard">
      <s-text slot="subtitle">
        Preview. Understand. Approve. Change. Verify.
      </s-text>



      {loaderData.approvedOperations.length > 0 && (
        <s-section heading="Approved changes">
          <s-stack direction="block" gap="base">
            {loaderData.approvedOperations.map((operation) => (
              <s-banner key={operation.id} tone="warning">
                <s-stack direction="block" gap="small">
                  <s-paragraph>
                    Approved operation {operation.id} · expires{" "}
                    {operation.approvalExpiresAt
                      ? new Date(operation.approvalExpiresAt).toLocaleString()
                      : "unknown"}
                  </s-paragraph>
                  <form method="post" action={`/app/operations/${operation.id}/execute`}>
                    <s-button type="submit" variant="primary">
                      Execute approved change
                    </s-button>
                  </form>
                </s-stack>
              </s-banner>
            ))}
          </s-stack>
        </s-section>
      )}
\n      <s-section heading="New price change">
        <s-paragraph>
          ChangeGuard scans matching products and calculates the proposed result
          before any Shopify data is modified. This first version is preview-only.
        </s-paragraph>

        <fetcher.Form method="post" id="change-plan-form">
          <s-stack direction="block" gap="base">
            <s-select label="Operation" name="operation" value="percentage">
              <s-option value="percentage">Increase/decrease by percentage</s-option>
              <s-option value="fixed">Add/subtract fixed amount</s-option>
            </s-select>

            <s-number-field
              label="Change value"
              name="value"
              step={0.01}
              min={-1000000}
              required
            ></s-number-field>

            <s-select label="Product scope" name="scope" value="all">
              <s-option value="all">All products</s-option>
              <s-option value="collection">Collection ID</s-option>
              <s-option value="product_type">Product type</s-option>
              <s-option value="vendor">Vendor</s-option>
              <s-option value="tag">Tag</s-option>
              <s-option value="status">Status</s-option>
            </s-select>

            <s-text-field
              label="Scope value (not required for All products)"
              name="scopeValue"
            ></s-text-field>

            <s-button type="submit" variant="primary" {...(isLoading ? { loading: true } : {})}>
              Build change plan
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      {actionData && !actionData.ok && (
        <s-section>
          <s-banner tone="critical">
            {actionData.error}
          </s-banner>
        </s-section>
      )}

      {plan && (
        <>
          <s-section heading="Change plan">
            <s-stack direction="block" gap="base">
              <s-banner tone="info">
                Preview only. No Shopify records have been changed.
              </s-banner>
              <s-paragraph>
                Draft operation {actionData?.ok ? actionData.operationId : ""} · plan hash {actionData?.ok ? actionData.planHash : ""}
              </s-paragraph>

              <form method="post" action={`/app/operations/${actionData?.ok ? actionData.operationId : ""}/approve`}>
                <s-button type="submit" variant="primary">
                  Approve this exact change plan
                </s-button>
              </form>

              {actionData?.ok && actionData.capped && (
                <s-banner tone="warning">
                  Scan stopped at the safety limit of {MAX_SCAN_PRODUCTS.toLocaleString()} products.
                </s-banner>
              )}

              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Metric</s-table-header>
                  <s-table-header>Count</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  <s-table-row>
                    <s-table-cell>Products scanned</s-table-cell>
                    <s-table-cell>{String(plan.recordsScanned)}</s-table-cell>
                  </s-table-row>
                  <s-table-row>
                    <s-table-cell>Variants scanned</s-table-cell>
                    <s-table-cell>{String(plan.variantsScanned)}</s-table-cell>
                  </s-table-row>
                  <s-table-row>
                    <s-table-cell>Will change</s-table-cell>
                    <s-table-cell>{String(plan.variantsToChange)}</s-table-cell>
                  </s-table-row>
                  <s-table-row>
                    <s-table-cell>Unchanged</s-table-cell>
                    <s-table-cell>{String(plan.unchanged)}</s-table-cell>
                  </s-table-row>
                  <s-table-row>
                    <s-table-cell>Errors</s-table-cell>
                    <s-table-cell>{String(plan.errors)}</s-table-cell>
                  </s-table-row>
                </s-table-body>
              </s-table>
            </s-stack>
          </s-section>

          <s-section heading="Before → after preview">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Product</s-table-header>
                <s-table-header>Variant</s-table-header>
                <s-table-header>Before</s-table-header>
                <s-table-header>After</s-table-header>
                <s-table-header>Status</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {plan.preview.slice(0, 100).map((item) => (
                  <s-table-row key={item.variantId}>
                    <s-table-cell>{item.productTitle}</s-table-cell>
                    <s-table-cell>{item.variantTitle}</s-table-cell>
                    <s-table-cell>{item.before}</s-table-cell>
                    <s-table-cell>{item.after ?? "—"}</s-table-cell>
                    <s-table-cell>
                      <s-badge
                        tone={
                          item.status === "change"
                            ? "info"
                            : item.status === "error"
                              ? "critical"
                              : "neutral"
                        }
                      >
                        {item.status}
                      </s-badge>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>

            {plan.preview.length > 100 && (
              <s-paragraph>
                Showing the first 100 variants in this preview. The plan counts
                include the full scanned result.
              </s-paragraph>
            )}
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

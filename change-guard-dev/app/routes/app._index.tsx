import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { listApprovedOperations, createOperationWithEvent } from "../lib/operation-store.server";
import { listPromotions } from "../lib/promotion-store.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { buildPriceChangePlan } from "../lib/change-plan";
import { createOperationDraft } from "../lib/operation-security";
import { buildProductQuery, readProducts } from "../lib/product-reader.server";

const MAX_SCAN_PRODUCTS = 10_000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const approvedOperations = await listApprovedOperations(session.shop);
  const promotions = await listPromotions(session.shop);

  return { approvedOperations, promotions };
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
    const { products, capped } = await readProducts(admin, buildProductQuery(scope, scopeValue));
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
      capped,
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



      <s-section heading="What do you want to do?">
        <s-stack direction="inline" gap="base">
          <s-link href="/app">
            <s-button variant="primary">Change Prices</s-button>
          </s-link>
          <s-link href="/app/promotions/new">
            <s-button>Run a Promotion</s-button>
          </s-link>
        </s-stack>
        <s-paragraph>
          Change prices permanently, or run a temporary sale with automatic restoration.
        </s-paragraph>
      </s-section>

      {loaderData.promotions.length > 0 && (
        <s-section heading="Promotions">
          <s-stack direction="block" gap="base">
            {loaderData.promotions.slice(-10).reverse().map((promotion) => (
              <s-banner key={promotion.id} tone={promotion.status === "conflict" || promotion.status === "failed" ? "critical" : "info"}>
                <s-stack direction="block" gap="small">
                  <s-paragraph>
                    {promotion.discountPercent}% promotion · {promotion.status} · starts{" "}
                    {new Date(promotion.startAt).toLocaleString()}
                  </s-paragraph>
                  <s-link href={`/app/promotions/${promotion.id}`}>
                    <s-button>View promotion status</s-button>
                  </s-link>
                </s-stack>
              </s-banner>
            ))}
          </s-stack>
        </s-section>
      )}

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

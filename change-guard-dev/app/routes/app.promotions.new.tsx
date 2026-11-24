import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  buildPromotionPlan,
  hashPromotionPlan,
} from "../lib/promotion-plan";
import { buildProductQuery, readProducts } from "../lib/product-reader.server";
import {
  createPromotionDraft,
  persistPromotionDraft,
} from "../lib/promotion-store.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const discountPercent = Number(formData.get("discountPercent"));
  const startAt = String(formData.get("startAt") ?? "");
  const endAt = String(formData.get("endAt") ?? "");
  const scope = String(formData.get("scope") ?? "all");
  const scopeValue = String(formData.get("scopeValue") ?? "");

  if (!Number.isFinite(discountPercent)) {
    return { ok: false as const, error: "Enter a valid discount percentage." };
  }

  try {
    const { products, capped } = await readProducts(
      admin,
      buildProductQuery(scope, scopeValue),
    );

    const plan = buildPromotionPlan(products, {
      discountPercent,
      startAt,
      endAt,
    });

    if (plan.variantsScanned > 5_000) {
      throw new Error(
        "This promotion exceeds the 5,000-variant approval limit in V1.",
      );
    }

    const draft = createPromotionDraft(
      session.shop,
      plan,
      hashPromotionPlan(plan),
    );

    await persistPromotionDraft(draft);

    return {
      ok: true as const,
      promotionId: draft.id,
      plan,
      capped,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Unable to build the promotion plan.",
    };
  }
};

export default function NewPromotion() {
  const fetcher = useFetcher<typeof action>();
  const data = fetcher.data;
  const plan = data?.ok ? data.plan : null;

  return (
    <s-page heading="Run a Promotion">
      <s-text slot="subtitle">
        Schedule a temporary discount and automatically restore the original prices.
      </s-text>

      <s-section heading="Promotion details">\n        <s-banner tone="info">\n          Start and end times use the Shopify store timezone: {describeTimeZone(timezone.ianaTimezone, timezone.timezoneAbbreviation)}.\n        </s-banner>
        <fetcher.Form method="post">
          <s-stack direction="block" gap="base">
            <s-number-field
              label="Discount percentage"
              name="discountPercent"
              min={0}
              max={100}
              step={0.01}
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

            <s-text-field
              label="Start time"
              name="startAt"
              type="datetime-local"
              required
            ></s-text-field>

            <s-text-field
              label="End time"
              name="endAt"
              type="datetime-local"
              required
            ></s-text-field>

            <s-button type="submit" variant="primary" {...(fetcher.state !== "idle" ? { loading: true } : {})}>
              Build promotion preview
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      {data && !data.ok && (
        <s-section>
          <s-banner tone="critical">{data.error}</s-banner>
        </s-section>
      )}

      {plan && data.ok && (
        <>
          <s-section heading="Promotion preview">
            <s-banner tone="info">
              Preview only. No Shopify prices have been changed.
            </s-banner>
            {data.capped && (
              <s-banner tone="warning">
                Scan stopped at the 10,000-product safety limit.
              </s-banner>
            )}
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Product</s-table-header>
                <s-table-header>Variant</s-table-header>
                <s-table-header>Original</s-table-header>
                <s-table-header>Promotion</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {plan.preview.slice(0, 100).map((item) => (
                  <s-table-row key={item.variantId}>
                    <s-table-cell>{item.productTitle}</s-table-cell>
                    <s-table-cell>{item.variantTitle}</s-table-cell>
                    <s-table-cell>{item.originalPrice}</s-table-cell>
                    <s-table-cell>{item.promotionalPrice ?? "—"}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            <s-paragraph>
              {plan.variantsToChange} variants will change. {plan.errors} variants have errors.
            </s-paragraph>
            <form method="post" action={`/app/promotions/${data.promotionId}/approve`}>
              <s-button type="submit" variant="primary">
                Approve &amp; Schedule Promotion
              </s-button>
            </form>
          </s-section>
        </>
      )}
    </s-page>
  );
}

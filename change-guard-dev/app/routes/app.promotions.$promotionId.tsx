import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  findPromotionById,
  listPromotionSnapshots,
} from "../lib/promotion-store.server";

function statusTone(status: string): "info" | "success" | "warning" | "critical" | "neutral" {
  switch (status) {
    case "completed":
      return "success";
    case "active":
      return "info";
    case "scheduled":
    case "starting":
    case "approved":
    case "restoring":
      return "warning";
    case "conflict":
    case "failed":
      return "critical";
    default:
      return "neutral";
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const promotionId = params.promotionId;

  if (!promotionId) {
    throw new Response("Promotion ID is required.", { status: 400 });
  }

  const promotion = await findPromotionById(promotionId, session.shop);

  if (!promotion) {
    throw new Response("Promotion was not found.", { status: 404 });
  }

  const snapshots = await listPromotionSnapshots(
    promotionId,
    session.shop,
  );

  const restored = snapshots.filter((snapshot) => snapshot.restoredAt).length;
  const conflicts = snapshots.filter((snapshot) => snapshot.conflictReason).length;

  return {
    promotion,
    snapshots,
    summary: {
      total: snapshots.length,
      restored,
      conflicts,
    },
  };
};

export default function PromotionDetails() {
  const { promotion, summary } = useLoaderData<typeof loader>();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <s-page heading="Promotion details">
      <s-text slot="subtitle">
        Review what ChangeGuard scheduled, changed, verified, and restored.
      </s-text>

      <s-section heading="Status">
        <s-stack direction="block" gap="base">
          <s-badge tone={statusTone(promotion.status)}>
            {promotion.status}
          </s-badge>
          <s-paragraph>
            Discount: {promotion.discountPercent}% · Start:{" "}
            {new Date(promotion.startAt).toLocaleString()} · End:{" "}
            {new Date(promotion.endAt).toLocaleString()} · {timezone}
          </s-paragraph>
          {promotion.failureReason && (
            <s-banner tone="critical">
              {promotion.failureReason}
            </s-banner>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Verification">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Result</s-table-header>
            <s-table-header>Count</s-table-header>
          </s-table-header-row>
          <s-table-body>
            <s-table-row>
              <s-table-cell>Variants in approved snapshot</s-table-cell>
              <s-table-cell>{summary.total}</s-table-cell>
            </s-table-row>
            <s-table-row>
              <s-table-cell>Variants restored and verified</s-table-cell>
              <s-table-cell>{summary.restored}</s-table-cell>
            </s-table-row>
            <s-table-row>
              <s-table-cell>Variants with conflicts</s-table-cell>
              <s-table-cell>{summary.conflicts}</s-table-cell>
            </s-table-row>
          </s-table-body>
        </s-table>

        {promotion.status === "completed" && summary.conflicts === 0 && (
          <s-banner tone="success">
            Promotion completed and all stored promotional prices were restored successfully.
          </s-banner>
        )}

        {(promotion.status === "conflict" || summary.conflicts > 0) && (
          <s-banner tone="warning">
            ChangeGuard detected a price conflict and did not silently overwrite the conflicting price.
          </s-banner>
        )}
      </s-section>

      <s-section heading="Timeline">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">Event</s-table-header>
            <s-table-header>Time</s-table-header>
          </s-table-header-row>
          <s-table-body>
            <s-table-row>
              <s-table-cell>Created</s-table-cell>
              <s-table-cell>{new Date(promotion.createdAt).toLocaleString()}</s-table-cell>
            </s-table-row>
            <s-table-row>
              <s-table-cell>Approved</s-table-cell>
              <s-table-cell>{promotion.approvedAt ? new Date(promotion.approvedAt).toLocaleString() : "—"}</s-table-cell>
            </s-table-row>
            <s-table-row>
              <s-table-cell>Activated</s-table-cell>
              <s-table-cell>{promotion.activatedAt ? new Date(promotion.activatedAt).toLocaleString() : "—"}</s-table-cell>
            </s-table-row>
            <s-table-row>
              <s-table-cell>Restoration started</s-table-cell>
              <s-table-cell>{promotion.restoringAt ? new Date(promotion.restoringAt).toLocaleString() : "—"}</s-table-cell>
            </s-table-row>
            <s-table-row>
              <s-table-cell>Completed</s-table-cell>
              <s-table-cell>{promotion.completedAt ? new Date(promotion.completedAt).toLocaleString() : "—"}</s-table-cell>
            </s-table-row>
          </s-table-body>
        </s-table>
      </s-section>

      <s-section>
        <s-link href="/app/promotions/new">
          <s-button>Run another promotion</s-button>
        </s-link>
        <s-link href="/app">
          <s-button>Back to ChangeGuard</s-button>
        </s-link>
      </s-section>
    </s-page>
  );
}

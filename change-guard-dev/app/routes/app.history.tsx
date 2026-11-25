import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { listOperationHistory } from "../lib/operation-store.server";
import { listPromotions } from "../lib/promotion-store.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [operations, promotions] = await Promise.all([
    listOperationHistory(session.shop),
    listPromotions(session.shop),
  ]);
  return { operations, promotions };
};

function statusTone(status: string): "info" | "success" | "warning" | "critical" | "neutral" {
  switch (status) {
    case "executed":
    case "completed": return "success";
    case "approved":
    case "scheduled":
    case "active":
    case "starting":
    case "restoring": return "warning";
    case "failed":
    case "conflict": return "critical";
    default: return "neutral";
  }
}

export default function History() {
  const { operations, promotions } = useLoaderData<typeof loader>();
  return (
    <s-page heading="History">
      <s-text slot="subtitle">Review completed price changes, promotions, and any conflicts or failures.</s-text>
      <s-section heading="Price changes">
        {operations.length === 0 ? <s-paragraph>No price changes yet.</s-paragraph> : (
          <s-table><s-table-header-row><s-table-header listSlot="primary">Operation</s-table-header><s-table-header>Status</s-table-header><s-table-header>Created</s-table-header><s-table-header>Completed</s-table-header></s-table-header-row>
            <s-table-body>{operations.map((operation) => (
              <s-table-row key={operation.id}>
                <s-table-cell>{operation.operationType}</s-table-cell>
                <s-table-cell><s-badge tone={statusTone(operation.status)}>{operation.status}</s-badge></s-table-cell>
                <s-table-cell>{new Date(operation.createdAt).toLocaleString()}</s-table-cell>
                <s-table-cell>{operation.executedAt ? new Date(operation.executedAt).toLocaleString() : operation.executionFailedAt ? "Failed: " + new Date(operation.executionFailedAt).toLocaleString() : "—"}</s-table-cell>
              </s-table-row>
            ))}</s-table-body>
          </s-table>
        )}
      </s-section>
      <s-section heading="Promotions">
        {promotions.length === 0 ? <s-paragraph>No promotions yet.</s-paragraph> : (
          <s-table><s-table-header-row><s-table-header listSlot="primary">Promotion</s-table-header><s-table-header>Status</s-table-header><s-table-header>Schedule</s-table-header><s-table-header>Details</s-table-header></s-table-header-row>
            <s-table-body>{promotions.slice().reverse().map((promotion) => (
              <s-table-row key={promotion.id}>
                <s-table-cell>{promotion.discountPercent}% promotion</s-table-cell>
                <s-table-cell><s-badge tone={statusTone(promotion.status)}>{promotion.status}</s-badge></s-table-cell>
                <s-table-cell>{new Date(promotion.startAt).toLocaleString()} → {new Date(promotion.endAt).toLocaleString()}</s-table-cell>
                <s-table-cell><s-link href={"/app/promotions/" + promotion.id}><s-button>View</s-button></s-link></s-table-cell>
              </s-table-row>
            ))}</s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
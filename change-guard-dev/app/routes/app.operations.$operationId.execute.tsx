import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import {
  claimOperationForExecution,
  findOperationById,
  markExpired,
  markOperationExecuted,
  markOperationFailed,
} from "../lib/operation-store.server";
import {
  assertApprovalFresh,
  createApprovalTokenHash,
} from "../lib/operation-security";
import { executePriceChangePlan } from "../lib/price-operation-executor";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const operationId = params.operationId;

  if (!operationId) {
    throw new Response("Operation ID is required.", { status: 400 });
  }

  const approvalSecret = process.env.SHOPIFY_API_SECRET;

  if (!approvalSecret) {
    throw new Response("Execution security configuration is unavailable.", {
      status: 500,
    });
  }

  const operation = await findOperationById(operationId);

  if (!operation || operation.shop !== session.shop) {
    throw new Response("Operation not found.", { status: 404 });
  }

  try {
    assertApprovalFresh(
      operation.status as Parameters<typeof assertApprovalFresh>[0],
      operation.approvalExpiresAt,
    );
  } catch (error) {
    if (operation.status === "approved") {
      await markExpired(operation.id, session.shop);
    }

    throw new Response(
      error instanceof Error ? error.message : "Operation approval is invalid.",
      { status: 409 },
    );
  }

  const expectedApprovalHash = createApprovalTokenHash(
    operation.id,
    operation.planHash,
    approvalSecret,
  );

  if (expectedApprovalHash !== operation.approvalTokenHash) {
    throw new Response("Operation approval proof is invalid.", { status: 403 });
  }

  const plan = operation.planJson ? JSON.parse(operation.planJson) : null;

  if (!plan) {
    throw new Response("Approved operation plan is missing.", { status: 500 });
  }

  const consumedAt = new Date();

  const claimed = await claimOperationForExecution(
    operation.id,
    session.shop,
    operation.planHash,
    expectedApprovalHash,
    consumedAt,
  );

  if (!claimed) {
    throw new Response(
      "Execution was rejected because this operation was already consumed or is no longer valid.",
      { status: 409 },
    );
  }

  try {
    const result = await executePriceChangePlan(admin, plan);

    await markOperationExecuted(operation.id, session.shop, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shopify execution failed.";

    await markOperationFailed(operation.id, session.shop, message);

    throw new Response(
      "Execution stopped safely. The operation was marked failed for review.",
      { status: 409 },
    );
  }

  return redirect("/app");
};

export default function ExecuteOperationRoute() {
  return null;
}

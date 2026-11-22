import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { approveOperation, findOperationById } from "../lib/operation-store.server";
import {
  createApprovalExpiry,
  createApprovalTokenHash,
} from "../lib/operation-security";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const operationId = params.operationId;

  if (!operationId) {
    throw new Response("Operation ID is required.", { status: 400 });
  }

  const operation = await findOperationById(operationId);

  if (!operation || operation.shop !== session.shop) {
    throw new Response("Operation not found.", { status: 404 });
  }

  if (operation.status !== "draft") {
    throw new Response("Operation is no longer awaiting approval.", { status: 409 });
  }

  const expiresAt = createApprovalExpiry();
  const approvalSecret = process.env.SHOPIFY_API_SECRET;

  if (!approvalSecret) {
    throw new Response("Approval security configuration is unavailable.", { status: 500 });
  }

  const approvalTokenHash = createApprovalTokenHash(
    operation.id,
    operation.planHash,
    approvalSecret,
  );

  const approved = await approveOperation(
    operation.id,
    session.shop,
    operation.planHash,
    approvalTokenHash,
    expiresAt,
  );

  if (!approved) {
    throw new Response("Operation could not be approved because it changed or was already approved.", {
      status: 409,
    });
  }

  return redirect("/app");
};

export default function ApproveOperationRoute() {
  return null;
}

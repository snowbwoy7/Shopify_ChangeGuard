import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  assertApprovalFresh,
  createApprovalTokenHash,
} from "../lib/operation-security";

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

  const operation = await prisma.operation.findUnique({
    where: { id: operationId },
  });

  if (!operation || operation.shop !== session.shop) {
    throw new Response("Operation not found.", { status: 404 });
  }

  try {
    assertApprovalFresh(
      operation.status as Parameters<typeof assertApprovalFresh>[0],
      operation.approvalExpiresAt?.toISOString() ?? null,
    );
  } catch (error) {
    if (operation.status === "approved") {
      await prisma.operation.update({
        where: { id: operation.id },
        data: { status: "expired" },
      });
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

  const plan = operation.planJson ? JSON.parse(operation.planJson) : null;\n\n  if (!plan) {\n    throw new Response("Approved operation plan is missing.", { status: 500 });\n  }\n\n  const consumedAt = new Date();

  const claimed = await prisma.$transaction(async (tx) => {
    const result = await tx.operation.updateMany({
      where: {
        id: operation.id,
        shop: session.shop,
        status: "approved",
        planHash: operation.planHash,
        approvalTokenHash: expectedApprovalHash,
        approvalExpiresAt: { gt: consumedAt },
      },
      data: {
        status: "consumed",
        consumedAt,
        executionStartedAt: consumedAt,
        executionAttempts: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      return false;
    }

    await tx.operationEvent.create({
      data: {
        id: randomUUID(),
        operationId: operation.id,
        shop: session.shop,
        eventType: "execution_started",
        metadataJson: JSON.stringify({
          planHash: operation.planHash,
          consumedAt: consumedAt.toISOString(),
        }),
      },
    });

    return true;
  });

  if (!claimed) {
    throw new Response(
      "Execution was rejected because this operation was already consumed or is no longer valid.",
      { status: 409 },
    );
  }

  return redirect("/app");
};

export default function ExecuteOperationRoute() {
  return null;
}

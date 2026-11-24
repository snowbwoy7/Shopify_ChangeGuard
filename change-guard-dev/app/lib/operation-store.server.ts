import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db.server";
import {
  operationEventTable,
  operationTable,
  type OperationRow,
} from "../schema";
import type { OperationInput, OperationStatus } from "./operation-security";

function nowIso(): string {
  return new Date().toISOString();
}

export async function findOperationById(
  id: string,
): Promise<OperationRow | undefined> {
  const rows = await db
    .select()
    .from(operationTable)
    .where(eq(operationTable.id, id))
    .limit(1);

  return rows[0];
}

export async function listOperationHistory(shop: string) {
  return db
    .select({
      id: operationTable.id,
      operationType: operationTable.operationType,
      status: operationTable.status,
      approvedAt: operationTable.approvedAt,
      executedAt: operationTable.executedAt,
      executionFailedAt: operationTable.executionFailedAt,
      failureReason: operationTable.failureReason,
      createdAt: operationTable.createdAt,
    })
    .from(operationTable)
    .where(eq(operationTable.shop, shop))
    .orderBy(desc(operationTable.createdAt))
    .limit(25);
}

export async function listApprovedOperations(shop: string, now = new Date()) {
  return db
    .select({
      id: operationTable.id,
      planHash: operationTable.planHash,
      approvedAt: operationTable.approvedAt,
      approvalExpiresAt: operationTable.approvalExpiresAt,
    })
    .from(operationTable)
    .where(
      and(
        eq(operationTable.shop, shop),
        eq(operationTable.status, "approved"),
        gt(operationTable.approvalExpiresAt, now.toISOString()),
      ),
    )
    .orderBy(desc(operationTable.approvedAt))
    .limit(10);
}

export async function createOperationWithEvent(
  operation: {
    id: string;
    shop: string;
    status: OperationStatus;
    operationType: string;
    input: OperationInput;
    plan: unknown;
    planHash: string;
  },
  eventMetadata: Record<string, unknown>,
): Promise<void> {
  const timestamp = nowIso();

  await db.transaction(async (tx) => {
    await tx.insert(operationTable).values({
      id: operation.id,
      shop: operation.shop,
      status: operation.status,
      operationType: operation.operationType,
      inputJson: JSON.stringify(operation.input),
      planJson: JSON.stringify(operation.plan),
      planHash: operation.planHash,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await tx.insert(operationEventTable).values({
      id: `event_${operation.id}`,
      operationId: operation.id,
      shop: operation.shop,
      eventType: "draft_created",
      metadataJson: JSON.stringify(eventMetadata),
      createdAt: timestamp,
    });
  });
}

export async function approveOperation(
  operationId: string,
  shop: string,
  planHash: string,
  approvalTokenHash: string,
  approvalExpiresAt: string,
): Promise<boolean> {
  const timestamp = nowIso();

  return db.transaction(async (tx) => {
    const result = await tx
      .update(operationTable)
      .set({
        status: "approved",
        approvedAt: timestamp,
        approvalExpiresAt,
        approvalTokenHash,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(operationTable.id, operationId),
          eq(operationTable.shop, shop),
          eq(operationTable.status, "draft"),
          eq(operationTable.planHash, planHash),
        ),
      )
      .run();

    if (result.rowsAffected !== 1) return false;

    await tx.insert(operationEventTable).values({
      id: `event_${operationId}_approved`,
      operationId,
      shop,
      eventType: "approved",
      metadataJson: JSON.stringify({
        planHash,
        approvalExpiresAt,
      }),
      createdAt: timestamp,
    });

    return true;
  });
}

export async function markExpired(
  operationId: string,
  shop: string,
): Promise<void> {
  await db
    .update(operationTable)
    .set({ status: "expired", updatedAt: nowIso() })
    .where(
      and(
        eq(operationTable.id, operationId),
        eq(operationTable.shop, shop),
        eq(operationTable.status, "approved"),
      ),
    )
    .run();
}

export async function claimOperationForExecution(
  operationId: string,
  shop: string,
  planHash: string,
  approvalTokenHash: string,
  consumedAt: Date,
): Promise<boolean> {
  const timestamp = consumedAt.toISOString();

  return db.transaction(async (tx) => {
    const result = await tx
      .update(operationTable)
      .set({
        status: "consumed",
        consumedAt: timestamp,
        executionStartedAt: timestamp,
        executionAttempts: sql`${operationTable.executionAttempts} + 1`,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(operationTable.id, operationId),
          eq(operationTable.shop, shop),
          eq(operationTable.status, "approved"),
          eq(operationTable.planHash, planHash),
          eq(operationTable.approvalTokenHash, approvalTokenHash),
          gt(operationTable.approvalExpiresAt, timestamp),
        ),
      )
      .run();

    if (result.rowsAffected !== 1) return false;

    await tx.insert(operationEventTable).values({
      id: `event_${operationId}_${Date.now()}`,
      operationId,
      shop,
      eventType: "execution_started",
      metadataJson: JSON.stringify({
        planHash,
        consumedAt: timestamp,
      }),
      createdAt: timestamp,
    });

    return true;
  });
}

export async function markOperationExecuted(
  operationId: string,
  shop: string,
  result: unknown,
): Promise<void> {
  const timestamp = nowIso();

  await db.transaction(async (tx) => {
    await tx
      .update(operationTable)
      .set({
        status: "executed",
        executedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(operationTable.id, operationId),
          eq(operationTable.shop, shop),
          eq(operationTable.status, "consumed"),
        ),
      )
      .run();

    await tx.insert(operationEventTable).values({
      id: `event_${operationId}_completed_${Date.now()}`,
      operationId,
      shop,
      eventType: "execution_completed",
      metadataJson: JSON.stringify(result),
      createdAt: timestamp,
    });
  });
}

export async function markOperationFailed(
  operationId: string,
  shop: string,
  message: string,
): Promise<void> {
  const timestamp = nowIso();

  await db.transaction(async (tx) => {
    await tx
      .update(operationTable)
      .set({
        status: "failed",
        executionFailedAt: timestamp,
        failureReason: message.slice(0, 4000),
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(operationTable.id, operationId),
          eq(operationTable.shop, shop),
          eq(operationTable.status, "consumed"),
        ),
      )
      .run();

    await tx.insert(operationEventTable).values({
      id: `event_${operationId}_failed_${Date.now()}`,
      operationId,
      shop,
      eventType: "execution_failed",
      metadataJson: JSON.stringify({ message: message.slice(0, 4000) }),
      createdAt: timestamp,
    });
  });
}

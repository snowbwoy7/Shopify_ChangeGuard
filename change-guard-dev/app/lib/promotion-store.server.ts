import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db.server";
import {
  promotionSnapshotTable,
  promotionTable,
  type PromotionRow,
  type PromotionSnapshotRow,
} from "../schema";
import type { PromotionPlan } from "./promotion-plan";

export type PromotionStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "starting"
  | "active"
  | "restoring"
  | "completed"
  | "conflict"
  | "failed";

function nowIso(): string {
  return new Date().toISOString();
}

export function assertPromotionTransition(
  current: PromotionStatus,
  next: PromotionStatus,
): void {
  const allowed: Record<PromotionStatus, PromotionStatus[]> = {
    draft: ["approved", "failed"],
    approved: ["scheduled", "failed"],
    scheduled: ["starting", "failed", "conflict"],
    starting: ["active", "failed", "conflict"],
    active: ["restoring", "failed", "conflict"],
    restoring: ["completed", "failed", "conflict"],
    completed: [],
    conflict: [],
    failed: [],
  };

  if (!allowed[current].includes(next)) {
    throw new Error(`Invalid promotion transition: ${current} -> ${next}.`);
  }
}

export function createPromotionDraft(
  shop: string,
  plan: PromotionPlan,
  planHash: string,
): {
  id: string;
  shop: string;
  status: "draft";
  discountPercent: string;
  startAt: string;
  endAt: string;
  plan: PromotionPlan;
  planHash: string;
} {
  if (!shop) throw new Error("Authenticated Shopify shop is required.");
  if (!planHash) throw new Error("Promotion plan hash is required.");

  return {
    id: randomUUID(),
    shop,
    status: "draft",
    discountPercent: String(plan.discountPercent),
    startAt: plan.startAt,
    endAt: plan.endAt,
    plan,
    planHash,
  };
}

export async function persistPromotionDraft(
  promotion: ReturnType<typeof createPromotionDraft>,
): Promise<void> {
  const timestamp = nowIso();

  await db.insert(promotionTable).values({
    id: promotion.id,
    shop: promotion.shop,
    status: promotion.status,
    discountPercent: promotion.discountPercent,
    startAt: promotion.startAt,
    endAt: promotion.endAt,
    planJson: JSON.stringify(promotion.plan),
    planHash: promotion.planHash,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function listPromotions(
  shop: string,
): Promise<PromotionRow[]> {
  return db
    .select()
    .from(promotionTable)
    .where(eq(promotionTable.shop, shop))
    .orderBy(asc(promotionTable.createdAt));
}

export async function findPromotionById(
  id: string,
  shop: string,
): Promise<PromotionRow | undefined> {
  const rows = await db
    .select()
    .from(promotionTable)
    .where(and(eq(promotionTable.id, id), eq(promotionTable.shop, shop)))
    .limit(1);

  return rows[0];
}

export async function listDuePromotions(
  now = new Date(),
): Promise<PromotionRow[]> {
  const timestamp = now.toISOString();

  return db
    .select()
    .from(promotionTable)
    .where(
      or(
        and(
          eq(promotionTable.status, "scheduled"),
          lte(promotionTable.startAt, timestamp),
        ),
        and(
          eq(promotionTable.status, "active"),
          lte(promotionTable.endAt, timestamp),
        ),
      ),
    )
    .orderBy(asc(promotionTable.startAt), asc(promotionTable.endAt));
}

export async function approvePromotion(
  promotionId: string,
  shop: string,
  planHash: string,
): Promise<boolean> {
  const timestamp = nowIso();

  return db.transaction(async (tx) => {
    const promotion = await tx
      .select()
      .from(promotionTable)
      .where(
        and(
          eq(promotionTable.id, promotionId),
          eq(promotionTable.shop, shop),
          eq(promotionTable.status, "draft"),
          eq(promotionTable.planHash, planHash),
        ),
      )
      .limit(1);

    if (!promotion[0]) return false;

    const plan = JSON.parse(promotion[0].planJson) as PromotionPlan;

    const result = await tx
      .update(promotionTable)
      .set({
        status: "approved",
        approvedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(promotionTable.id, promotionId),
          eq(promotionTable.shop, shop),
          eq(promotionTable.status, "draft"),
          eq(promotionTable.planHash, planHash),
        ),
      )
      .run();

    if (result.rowsAffected !== 1) return false;

    const snapshots = plan.preview
      .filter(
        (item) =>
          item.status === "change" && item.promotionalPrice !== null,
      )
      .map((item) => ({
        id: randomUUID(),
        promotionId,
        shop,
        productId: item.productId,
        variantId: item.variantId,
        originalPrice: item.originalPrice,
        expectedPrice: item.promotionalPrice!,
      }));

    if (snapshots.length > 0) {
      await tx.insert(promotionSnapshotTable).values(snapshots);
    }

    return true;
  });
}

export async function schedulePromotion(
  promotionId: string,
  shop: string,
): Promise<boolean> {
  const timestamp = nowIso();

  return db.transaction(async (tx) => {
    const promotion = await tx
      .select({ status: promotionTable.status })
      .from(promotionTable)
      .where(
        and(eq(promotionTable.id, promotionId), eq(promotionTable.shop, shop)),
      )
      .limit(1);

    if (!promotion[0] || promotion[0].status !== "approved") return false;

    const result = await tx
      .update(promotionTable)
      .set({ status: "scheduled", updatedAt: timestamp })
      .where(
        and(
          eq(promotionTable.id, promotionId),
          eq(promotionTable.shop, shop),
          eq(promotionTable.status, "approved"),
        ),
      )
      .run();

    return result.rowsAffected === 1;
  });
}

export async function claimDuePromotion(
  promotionId: string,
  shop: string,
  now = new Date(),
): Promise<PromotionRow | undefined> {
  const timestamp = now.toISOString();
  const claimCutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

  return db.transaction(async (tx) => {
    const result = await tx
      .update(promotionTable)
      .set({
        processingAttempts: sql`${promotionTable.processingAttempts} + 1`,
        lastClaimedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(promotionTable.id, promotionId),
          eq(promotionTable.shop, shop),
          or(
            isNull(promotionTable.lastClaimedAt),
            lte(promotionTable.lastClaimedAt, claimCutoff),
          ),
          or(
            and(
              eq(promotionTable.status, "scheduled"),
              lte(promotionTable.startAt, timestamp),
            ),
            and(
              eq(promotionTable.status, "active"),
              lte(promotionTable.endAt, timestamp),
            ),
          ),
        ),
      )
      .run();

    if (result.rowsAffected !== 1) return undefined;

    const rows = await tx
      .select()
      .from(promotionTable)
      .where(
        and(eq(promotionTable.id, promotionId), eq(promotionTable.shop, shop)),
      )
      .limit(1);

    return rows[0];
  });
}

export async function transitionPromotion(
  promotionId: string,
  shop: string,
  from: PromotionStatus,
  to: PromotionStatus,
  fields: Partial<Pick<
    PromotionRow,
    "activatedAt" | "restoringAt" | "completedAt" | "failureReason"
  >> = {},
): Promise<boolean> {
  assertPromotionTransition(from, to);

  const result = await db
    .update(promotionTable)
    .set({ status: to, ...fields, updatedAt: nowIso() })
    .where(
      and(
        eq(promotionTable.id, promotionId),
        eq(promotionTable.shop, shop),
        eq(promotionTable.status, from),
      ),
    )
    .run();

  return result.rowsAffected === 1;
}

export async function listPromotionSnapshots(
  promotionId: string,
  shop: string,
): Promise<PromotionSnapshotRow[]> {
  return db
    .select()
    .from(promotionSnapshotTable)
    .where(
      and(
        eq(promotionSnapshotTable.promotionId, promotionId),
        eq(promotionSnapshotTable.shop, shop),
      ),
    );
}

export async function markSnapshotRestored(
  snapshotId: string,
  shop: string,
): Promise<boolean> {
  const result = await db
    .update(promotionSnapshotTable)
    .set({ restoredAt: nowIso(), conflictReason: null })
    .where(
      and(
        eq(promotionSnapshotTable.id, snapshotId),
        eq(promotionSnapshotTable.shop, shop),
        isNull(promotionSnapshotTable.restoredAt),
      ),
    )
    .run();

  return result.rowsAffected === 1;
}

export async function markSnapshotConflict(
  snapshotId: string,
  shop: string,
  reason: string,
): Promise<boolean> {
  const result = await db
    .update(promotionSnapshotTable)
    .set({ conflictReason: reason.slice(0, 1000) })
    .where(
      and(
        eq(promotionSnapshotTable.id, snapshotId),
        eq(promotionSnapshotTable.shop, shop),
      ),
    )
    .run();

  return result.rowsAffected === 1;
}

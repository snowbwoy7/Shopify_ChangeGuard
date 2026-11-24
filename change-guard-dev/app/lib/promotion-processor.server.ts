import {
  listDuePromotions,
  claimDuePromotion,
  listPromotionSnapshots,
  transitionPromotion,
  markSnapshotConflict,
  markSnapshotRestored,
} from "./promotion-store.server";
import {
  executePromotionStart,
  executePromotionRestore,
} from "./promotion-executor";
import { unauthenticated } from "../shopify.server";

export type PromotionProcessorResult = {
  processed: number;
  completed: number;
  conflicts: number;
  failures: number;
};

function executionFailureReason(
  errors: string[],
  fallback: string,
): string {
  return (errors.length > 0 ? errors.join(" | ") : fallback).slice(0, 4000);
}

async function markExecutionIssues(
  shop: string,
  issues: Array<{
    variantId?: string;
    kind: "conflict" | "error";
    message: string;
  }>,
  snapshots: Array<{ id: string; variantId: string }>,
): Promise<void> {
  for (const issue of issues) {
    if (!issue.variantId) continue;

    const snapshot = snapshots.find(
      (candidate) => candidate.variantId === issue.variantId,
    );

    if (!snapshot) continue;

    await markSnapshotConflict(
      snapshot.id,
      shop,
      issue.message,
    );
  }
}

export async function processDuePromotions(
  now = new Date(),
): Promise<PromotionProcessorResult> {
  const due = await listDuePromotions(now);
  const result: PromotionProcessorResult = {
    processed: 0,
    completed: 0,
    conflicts: 0,
    failures: 0,
  };

  for (const candidate of due) {
    const promotion = await claimDuePromotion(candidate.id, candidate.shop, now);
    if (!promotion) continue;

    result.processed += 1;

    let processingStatus = promotion.status;

    try {
      const snapshots = await listPromotionSnapshots(
        promotion.id,
        promotion.shop,
      );

      const { admin } = await unauthenticated.admin(promotion.shop);

      if (promotion.status === "scheduled") {
        const beganStarting = await transitionPromotion(
          promotion.id,
          promotion.shop,
          "scheduled",
          "starting",
        );

        if (!beganStarting) continue;

        processingStatus = "starting";
        const execution = await executePromotionStart(admin, snapshots);

        if (execution.conflicts > 0 || execution.errors.length > 0) {
          // A batch mutation can partially succeed before a later target
          // conflicts. Best-effort restore any variants that did change so a
          // failed promotion does not leave temporary prices behind.
          if (execution.appliedVariantIds.length > 0 || execution.alreadyAppliedVariantIds.length > 0) {
            const recovery = await executePromotionRestore(admin, snapshots);
            for (const variantId of [
              ...recovery.appliedVariantIds,
              ...recovery.alreadyAppliedVariantIds,
            ]) {
              const snapshot = snapshots.find(
                (candidate) => candidate.variantId === variantId,
              );
              if (snapshot) {
                await markSnapshotRestored(snapshot.id, promotion.shop);
              }
            }
            if (recovery.conflicts > 0 || recovery.errors.length > 0) {
              await markExecutionIssues(
                promotion.id,
                promotion.shop,
                recovery.issues,
                snapshots,
              );
            }
          }

          await markExecutionIssues(
            promotion.shop,
            execution.issues,
            snapshots,
          );
          await transitionPromotion(
            promotion.id,
            promotion.shop,
            "starting",
            "conflict",
            {
              failureReason: executionFailureReason(
                execution.errors,
                "Promotion start encountered one or more conflicts.",
              ),
            },
          );
          result.conflicts += 1;
          continue;
        }

        await transitionPromotion(
          promotion.id,
          promotion.shop,
          "starting",
          "active",
          { activatedAt: now.toISOString() },
        );
        continue;
      }

      if (promotion.status === "active") {
        const beganRestoration = await transitionPromotion(
          promotion.id,
          promotion.shop,
          "active",
          "restoring",
          { restoringAt: now.toISOString() },
        );

        if (!beganRestoration) continue;

        processingStatus = "restoring";
        const execution = await executePromotionRestore(admin, snapshots);

        if (execution.conflicts > 0 || execution.errors.length > 0) {
          // Mark variants that were successfully restored even if another
          // variant conflicted, so a retry cannot attempt the same restore
          // against a price that is already back to its original value.
          for (const variantId of [
            ...execution.appliedVariantIds,
            ...execution.alreadyAppliedVariantIds,
          ]) {
            const snapshot = snapshots.find(
              (candidate) => candidate.variantId === variantId,
            );
            if (snapshot) {
              await markSnapshotRestored(snapshot.id, promotion.shop);
            }
          }

          await markExecutionIssues(
            promotion.shop,
            execution.issues,
            snapshots,
          );
          await transitionPromotion(
            promotion.id,
            promotion.shop,
            "restoring",
            "conflict",
            {
              failureReason: executionFailureReason(
                execution.errors,
                "Promotion restoration encountered one or more conflicts.",
              ),
            },
          );
          result.conflicts += 1;
          continue;
        }

        for (const snapshot of snapshots) {
          await markSnapshotRestored(snapshot.id, promotion.shop);
        }

        await transitionPromotion(
          promotion.id,
          promotion.shop,
          "restoring",
          "completed",
          { completedAt: now.toISOString() },
        );

        result.completed += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown promotion processing error.";

      if (
        processingStatus === "scheduled" ||
        processingStatus === "starting" ||
        processingStatus === "active" ||
        processingStatus === "restoring"
      ) {
        await transitionPromotion(
          promotion.id,
          promotion.shop,
          processingStatus,
          "failed",
          { failureReason: message.slice(0, 4000) },
        );
      }

      result.failures += 1;
    }
  }

  return result;
}

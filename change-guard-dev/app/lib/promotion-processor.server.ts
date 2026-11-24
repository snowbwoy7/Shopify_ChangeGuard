import { listDuePromotions, claimDuePromotion, listPromotionSnapshots, transitionPromotion, markSnapshotRestored } from "./promotion-store.server";
import { executePromotionStart, executePromotionRestore } from "./promotion-executor";
import { unauthenticated } from "../shopify.server";

export type PromotionProcessorResult = {
  processed: number;
  completed: number;
  conflicts: number;
  failures: number;
};

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
          await transitionPromotion(
            promotion.id,
            promotion.shop,
            "starting",
            "conflict",
            {
              failureReason: execution.errors.join(" | ").slice(0, 4000),
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
          await transitionPromotion(
            promotion.id,
            promotion.shop,
            "restoring",
            "conflict",
            {
              failureReason: execution.errors.join(" | ").slice(0, 4000),
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
        error instanceof Error ? error.message : "Unknown promotion processing error.";

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

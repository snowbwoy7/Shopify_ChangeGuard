import type { PromotionSnapshotRow } from "../schema";
import {
  executePriceTargets,
  type PriceExecutionResult,
} from "./price-execution.server";

export function buildPromotionStartTargets(
  snapshots: PromotionSnapshotRow[],
) {
  return snapshots.map((snapshot) => ({
    productId: snapshot.productId,
    productTitle: snapshot.productId,
    variantId: snapshot.variantId,
    variantTitle: snapshot.variantId,
    expectedCurrentPrice: snapshot.originalPrice,
    targetPrice: snapshot.expectedPrice,
  }));
}

export function buildPromotionRestoreTargets(
  snapshots: PromotionSnapshotRow[],
) {
  return snapshots
    .filter((snapshot) => !snapshot.restoredAt && !snapshot.conflictReason)
    .map((snapshot) => ({
      productId: snapshot.productId,
      productTitle: snapshot.productId,
      variantId: snapshot.variantId,
      variantTitle: snapshot.variantId,
      expectedCurrentPrice: snapshot.expectedPrice,
      targetPrice: snapshot.originalPrice,
    }));
}

export async function executePromotionStart(
  admin: Parameters<typeof executePriceTargets>[0],
  snapshots: PromotionSnapshotRow[],
): Promise<PriceExecutionResult> {
  return executePriceTargets(admin, buildPromotionStartTargets(snapshots), {\n    throwOnError: false,\n  });
}

export async function executePromotionRestore(
  admin: Parameters<typeof executePriceTargets>[0],
  snapshots: PromotionSnapshotRow[],
): Promise<PriceExecutionResult> {
  return executePriceTargets(admin, buildPromotionRestoreTargets(snapshots), {\n    throwOnError: false,\n  });
}

import type { ChangePlan, PreviewItem } from "./change-plan";
import { executePriceTargets } from "./price-execution.server";

export type ExecutionResult = Awaited<
  ReturnType<typeof executePriceTargets>
>;

export async function executePriceChangePlan(
  admin: Parameters<typeof executePriceTargets>[0],
  plan: ChangePlan,
): Promise<ExecutionResult> {
  const changes = plan.preview.filter(
    (item: PreviewItem): item is PreviewItem & { after: string } =>
      item.status === "change" && item.after !== null,
  );

  return executePriceTargets(
    admin,
    changes.map((item) => ({
      productId: item.productId,
      productTitle: item.productTitle,
      variantId: item.variantId,
      variantTitle: item.variantTitle,
      expectedCurrentPrice: item.before,
      targetPrice: item.after,
    })),
  );
}

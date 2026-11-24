import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  approvePromotion,
  findPromotionById,
  schedulePromotion,
} from "../lib/promotion-store.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const promotionId = params.promotionId;

  if (!promotionId) {
    throw new Response("Promotion ID is required.", { status: 400 });
  }

  const promotion = await findPromotionById(promotionId, session.shop);

  if (!promotion) {
    throw new Response("Promotion was not found.", { status: 404 });
  }

  if (promotion.status !== "draft") {
    throw new Response("Promotion is no longer available for approval.", {
      status: 409,
    });
  }

  const approved = await approvePromotion(
    promotionId,
    session.shop,
    promotion.planHash,
  );

  if (!approved) {
    throw new Response(
      "Promotion approval failed because its state changed. Refresh and review the promotion again.",
      { status: 409 },
    );
  }

  const scheduled = await schedulePromotion(promotionId, session.shop);

  if (!scheduled) {
    throw new Response(
      "Promotion was approved but could not be scheduled. Review its status before retrying.",
      { status: 409 },
    );
  }

  return redirect("/app");
};

export default function ApprovePromotion() {
  return (
    <s-page heading="Promotion scheduled">
      <s-banner tone="info">
        The promotion was approved and scheduled. Prices will be changed at the start time.
      </s-banner>
    </s-page>
  );
}

import type { LoaderFunctionArgs } from "react-router";
import { processDuePromotions } from "../lib/promotion-processor.server";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("x-cron-secret");

  return Boolean(expected && supplied && supplied === expected);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthorized(request)) {
    throw new Response("Unauthorized.", { status: 401 });
  }

  const result = await processDuePromotions();

  return Response.json(result);
};

export const action = loader;

export default function PromotionProcessorRoute() {
  return null;
}

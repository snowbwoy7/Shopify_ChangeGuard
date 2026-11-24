import {
  type RouteConfig,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  index("./routes/_index/route.tsx"),
  route("app", "./routes/app.tsx", [
    index("./routes/app._index.tsx"),
    route("additional", "./routes/app.additional.tsx"),
    route("operations/:operationId/approve", "./routes/app.operations.$operationId.approve.tsx"),
    route("operations/:operationId/execute", "./routes/app.operations.$operationId.execute.tsx"),
    route("promotions/new", "./routes/app.promotions.new.tsx"),
    route("promotions/:promotionId/approve", "./routes/app.promotions.$promotionId.approve.tsx"),
  ]),
  route("auth/*", "./routes/auth.$.tsx"),
  route("webhooks/app/scopes_update", "./routes/webhooks.app.scopes_update.tsx"),
  route("webhooks/app/uninstalled", "./routes/webhooks.app.uninstalled.tsx"),
  route("webhooks/products/update", "./routes/webhooks.products.update.tsx"),
  route("internal/promotions/process", "./routes/internal.promotions.process.ts"),
] satisfies RouteConfig;

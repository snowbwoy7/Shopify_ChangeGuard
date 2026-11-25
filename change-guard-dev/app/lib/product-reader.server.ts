import type { ProductSnapshot } from "./change-plan";

const MAX_SCAN_PRODUCTS = 10_000;

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export function buildProductQuery(
  scope: string,
  scopeValue: string,
): string | undefined {
  if (scope === "all" || !scopeValue.trim()) return undefined;

  const escaped = scopeValue
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"");

  switch (scope) {
    case "collection":
      return `collection_id:${escaped}`;
    case "product_type":
      return `product_type:"${escaped}"`;
    case "vendor":
      return `vendor:"${escaped}"`;
    case "tag":
      return `tag:"${escaped}"`;
    case "status":
      return `status:${escaped.toLowerCase()}`;
    default:
      throw new Error("Unsupported product scope.");
  }
}

type ShopifyProductsPayload = {
  data?: {
    products?: {
      edges: Array<{
        cursor: string;
        node: {
          id: string;
          title: string;
          handle: string;
          status: string;
          vendor: string;
          productType: string;
          tags: string[];
          variants: {
            nodes: Array<{ id: string; title: string; price: string }>;
          };
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string }>;
};

export async function readProducts(
  admin: AdminGraphqlClient,
  query: string | undefined,
): Promise<{ products: ProductSnapshot[]; capped: boolean }> {
  const products: ProductSnapshot[] = [];
  let cursor: string | null = null;

  while (products.length < MAX_SCAN_PRODUCTS) {
    const response = await admin.graphql(
      `#graphql
        query ChangeGuardProducts($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query, sortKey: ID) {
            edges {
              cursor
              node {
                id
                title
                handle
                status
                vendor
                productType
                tags
                variants(first: 250) {
                  nodes { id title price }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
      {
        variables: {
          first: 250,
          after: cursor,
          query,
        },
      },
    );

    const payload = (await response.json()) as ShopifyProductsPayload;

    if (payload.errors?.length) {
      throw new Error(
        payload.errors.map((error) => error.message).join("; "),
      );
    }

    const connection = payload.data?.products;
    if (!connection) throw new Error("Shopify did not return product data.");

    for (const edge of connection.edges) {
      products.push({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        status: edge.node.status,
        vendor: edge.node.vendor,
        productType: edge.node.productType,
        tags: edge.node.tags,
        variants: edge.node.variants.nodes.map((variant) => ({
          id: variant.id,
          title: variant.title,
          price: variant.price,
        })),
      });

      if (products.length >= MAX_SCAN_PRODUCTS) break;
    }

    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    cursor = connection.pageInfo.endCursor;
  }

  return {
    products,
    capped: products.length >= MAX_SCAN_PRODUCTS,
  };
}

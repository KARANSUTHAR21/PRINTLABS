import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout route for /products — renders either the catalog index
 * (`products.index.tsx`) or a single product (`products.$id.tsx`).
 */
export const Route = createFileRoute("/products")({ component: ProductsLayout });

function ProductsLayout() {
  return <Outlet />;
}

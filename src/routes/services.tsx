import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout route for /services — renders either the services index
 * (`services.index.tsx`) or a single service (`services.$slug.tsx`).
 */
export const Route = createFileRoute("/services")({ component: ServicesLayout });

function ServicesLayout() {
  return <Outlet />;
}

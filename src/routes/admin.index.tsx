import { Link, createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";

export const Route = createFileRoute("/admin/")({ component: AdminOverviewRoute });
const areas = [
  ["Users", "/admin/users", "Review account roles and access."],
  ["Vendors and applications", "/admin/vendors", "Review applications and manage approved vendor state."],
  ["Shops", "/admin/shops", "Verify and activate vendor shops."],
  ["Catalog", "/admin/products", "Manage the public PrintHub product catalog."],
  ["Services", "/admin/services", "Manage public services and their display order."],
  ["Orders", "/admin/orders", "Review platform orders and lifecycle state."],
  ["Payments", "/admin/payments", "Inspect provider attempts; payment capture remains provider-verified."],
  ["Refunds", "/admin/refunds", "Review refund cases without initiating money movement."],
  ["Subscriptions", "/admin/subscriptions", "Inspect vendor subscription and trial status."],
  ["Delivery partners", "/admin/delivery-partners", "Review partner availability and completed assignments."],
  ["Delivery requests", "/delivery/admin", "Assign or reject eligible customer delivery requests."],
  ["Vendor onboarding", "/vendor/admin", "Review applications, verify shops, and manage activation."],
  ["Audit log", "/admin/audit", "Review administrative and payment events."],
] as const;
function AdminOverviewRoute() {
  return <AdminShell><AdminPageHeading title="Admin overview" description="Platform operations are restricted to Admin accounts and enforced again by guarded server functions." /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{areas.map(([title, to, detail]) => <Link key={to} to={to as never} className="card-surface p-5 transition-shadow hover:shadow-pop"><h2 className="font-bold">{title}</h2><p className="mt-2 text-sm text-muted">{detail}</p><span className="mt-4 inline-block text-sm font-semibold text-primary">Open workspace →</span></Link>)}</div><p className="mt-5 text-sm text-muted">Legacy vendor onboarding remains at <Link to="/vendor/admin" className="font-semibold text-primary">/vendor/admin</Link>.</p></AdminShell>;
}

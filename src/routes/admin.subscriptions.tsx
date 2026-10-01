import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { adminListSubscriptions } from "@/lib/api/admin";

type Subscription = { id: string; vendorId: string; vendorName: string; vendorEmail: string | null; planName: string; pricePaise: number; billingCycle: string; status: string; startsAt: string | null; nextDueAt: string | null; expiresAt: string | null };
export const Route = createFileRoute("/admin/subscriptions")({ component: AdminSubscriptionsRoute });
function AdminSubscriptionsRoute() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void adminListSubscriptions().then((result) => { if (result.success) setSubscriptions(result.subscriptions); else setError(result.message); }).catch(() => setError("Could not load subscriptions.")); }, []);
  return <AdminShell><AdminPageHeading title="Subscriptions" description="Read-only view of vendor plans, starter trials, billing dates, and current status. No paid subscription checkout or manual status mutation is enabled." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Vendor", "Plan", "Price", "Status", "Starts", "Next due", "Expires"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{subscriptions.map((sub) => <tr key={sub.id} className="border-t border-line"><td className="px-4 py-3">{sub.vendorName}<span className="block text-xs text-muted">{sub.vendorEmail ?? sub.vendorId}</span></td><td className="px-4 py-3">{sub.planName} <span className="text-xs text-muted">{sub.billingCycle}</span></td><td className="px-4 py-3">{sub.pricePaise} paise</td><td className="px-4 py-3">{sub.status}</td><td className="px-4 py-3 text-xs">{sub.startsAt ? new Date(sub.startsAt).toLocaleDateString() : "—"}</td><td className="px-4 py-3 text-xs">{sub.nextDueAt ? new Date(sub.nextDueAt).toLocaleDateString() : "—"}</td><td className="px-4 py-3 text-xs">{sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : "—"}</td></tr>)}</tbody></table>{subscriptions.length === 0 && <p className="p-8 text-sm text-muted">No vendor subscriptions found.</p>}</section></AdminShell>;
}

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DeliveryPageHeading, DeliveryShell } from "@/components/delivery/delivery-shell";
import { loadMyDeliveryAssignments, loadMyDeliveryPreferences } from "@/lib/api/delivery";
import type { DeliveryAssignment } from "@/lib/server/delivery";

export const Route = createFileRoute("/delivery/dashboard")({ component: Dashboard });
function Dashboard() {
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void Promise.all([loadMyDeliveryAssignments(), loadMyDeliveryPreferences()]).then(([rows, settings]) => {
      if (rows.success) setAssignments(rows.assignments); else setError(rows.message);
      if (settings.success) setAvailable(settings.preferences.available);
    }).catch(() => setError("Could not load delivery partner workspace."));
  }, []);
  return <DeliveryShell><DeliveryPageHeading title="Dashboard" description="Your currently assigned, paid, ready orders are listed here." />{error && <p role="alert" className="mb-4 text-danger">{error}</p>}<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-4"><p className="text-sm">New assignment availability: <strong>{available ? "Available" : "Unavailable"}</strong></p><Link to="/delivery/settings" className="btn-outline min-h-9">Manage availability</Link></div><section className="card-surface divide-y divide-line">{assignments.map((assignment) => <article key={assignment.id} className="flex flex-wrap justify-between gap-3 p-4"><div><p className="font-semibold">Order {assignment.orderId}</p><p className="text-xs text-muted">{assignment.status.replaceAll("_", " ")}</p></div><Link to="/delivery/orders" className="btn-outline min-h-9">Open assigned orders</Link></article>)}{assignments.length === 0 && <p className="p-8 text-sm text-muted">No active deliveries assigned yet.</p>}</section></DeliveryShell>;
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { loadMyDeliveryAssignments } from "@/lib/api/delivery";
import type { DeliveryAssignment } from "@/lib/server/delivery";
import { RoleProtected } from "@/components/auth/role-protected";

export const Route = createFileRoute("/delivery/dashboard")({ component: Dashboard });
function Dashboard() {
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void loadMyDeliveryAssignments().then((r) => { if (r.success) setAssignments(r.assignments); else setError(r.message); }).catch(() => setError("Could not load assigned deliveries.")); }, []);
  return <RoleProtected allowedRoles={["DELIVERY_PARTNER"]}><main className="container-page py-12"><h1 className="text-3xl font-extrabold">Delivery Partner Dashboard</h1><p className="mt-2 text-sm text-muted">Only deliveries assigned to your account are listed here.</p>{error && <p role="alert" className="mt-4 text-danger">{error}</p>}<section className="card-surface mt-6 divide-y divide-line">{assignments.map((a) => <article key={a.id} className="flex justify-between gap-4 p-4"><span>Order {a.orderId}</span><span className="font-semibold">{a.status.replaceAll("_", " ")}</span></article>)}{assignments.length === 0 && <p className="p-8 text-sm text-muted">No active deliveries assigned yet.</p>}</section></main></RoleProtected>;
}

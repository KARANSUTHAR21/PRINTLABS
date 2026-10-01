import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPageHeading, DeliveryShell } from "@/components/delivery/delivery-shell";
import { loadMyDeliveryHistory } from "@/lib/api/delivery";
import type { DeliveryAssignment } from "@/lib/server/delivery";

export const Route = createFileRoute("/delivery/history")({ component: DeliveryHistoryRoute });
function DeliveryHistoryRoute() {
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void loadMyDeliveryHistory().then((result) => { if (result.success) setAssignments(result.assignments); else setError(result.message); }).catch(() => setError("Could not load delivery history.")); }, []);
  return <DeliveryShell><DeliveryPageHeading title="Delivery history" description="Completed assignments belonging to your partner account." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface divide-y divide-line">{assignments.map((assignment) => <article key={assignment.id} className="flex flex-wrap justify-between gap-3 p-4"><div><p className="font-semibold">Order {assignment.orderId}</p><p className="text-xs text-muted">Picked up {assignment.pickedUpAt ? new Date(assignment.pickedUpAt).toLocaleString() : "—"}</p></div><p className="text-sm text-muted">Delivered {assignment.deliveredAt ? new Date(assignment.deliveredAt).toLocaleString() : "—"}</p></article>)}{assignments.length === 0 && <p className="p-8 text-sm text-muted">No completed deliveries yet.</p>}</section></DeliveryShell>;
}

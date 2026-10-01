import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { adminAuditLog } from "@/lib/api/admin";

type EventRow = { eventType: string; orderId: string | null; paymentId: string | null; userId: string | null; status: string | null; providerEventId: string | null; metadata: string; createdAt: string };
export const Route = createFileRoute("/admin/audit")({ component: AdminAuditRoute });
function AdminAuditRoute() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void adminAuditLog({ data: {} }).then((result) => { if (result.success) setEvents(result.events); else setError(result.message); }).catch(() => setError("Could not load audit events.")); }, []);
  return <AdminShell><AdminPageHeading title="Audit log" description="Latest authenticated platform and provider events. Record metadata is server-generated and read-only here." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface divide-y divide-line">{events.map((event, index) => <article key={`${event.createdAt}-${index}`} className="grid gap-2 p-4 sm:grid-cols-[12rem_1fr]"><p className="text-xs text-muted">{new Date(event.createdAt).toLocaleString()}</p><div><p className="font-semibold">{event.eventType}{event.status ? ` · ${event.status}` : ""}</p><p className="text-xs text-muted">{[event.orderId && `Order ${event.orderId}`, event.paymentId && `Payment ${event.paymentId}`, event.userId && `User ${event.userId}`, event.providerEventId && `Provider event ${event.providerEventId}`].filter(Boolean).join(" · ")}</p><pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{event.metadata}</pre></div></article>)}{events.length === 0 && <p className="p-8 text-sm text-muted">No audit events.</p>}</section></AdminShell>;
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { assignDeliveryRequestFn, loadDeliveryRequests, rejectDeliveryRequestFn } from "@/lib/api/delivery";

export const Route = createFileRoute("/delivery/admin")({ component: AdminDeliveryRoute });
type RequestRow = { id: string; orderId: string; userId: string; status: string; createdAt: string };
function AdminDeliveryRoute() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [partnerIds, setPartnerIds] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  async function refresh() { const result = await loadDeliveryRequests(); if (result.success) setRequests(result.requests); else setError(result.message); }
  useEffect(() => { void refresh().catch(() => setError("Could not load delivery requests.")); }, []);
  async function reject(requestId: string) { if (busyId) return; setBusyId(requestId); setError(""); try { const result = await rejectDeliveryRequestFn({ data: { requestId, reason: "Rejected by Admin" } }); if (!result.success) setError(result.message); else { setMessage("Delivery request rejected."); await refresh(); } } catch { setError("Could not reject this request."); } finally { setBusyId(""); } }
  async function assign(requestId: string) { const partnerId = partnerIds[requestId]?.trim(); if (!partnerId || busyId) return; setBusyId(requestId); setError(""); setMessage(""); try { const result = await assignDeliveryRequestFn({ data: { requestId, partnerId } }); if (!result.success) setError(result.message); else { setMessage(`Assigned order ${result.assignment.orderId}.`); await refresh(); } } catch { setError("Could not assign this request."); } finally { setBusyId(""); } }
  return <AdminShell><AdminPageHeading title="Delivery requests" description="Assign only to an available account whose database role is Delivery Partner. Assignment rechecks payment, readiness, availability, and uniqueness in SQL." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}{message && <p role="status" className="mb-4 text-sm text-success">{message}</p>}<section className="card-surface divide-y divide-line">{requests.map((request) => <form key={request.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void assign(request.id); }}><div><p className="font-semibold">Order {request.orderId}</p><p className="text-xs text-muted">Requested by {request.userId} · {new Date(request.createdAt).toLocaleString()}</p></div><label className="text-sm">Delivery partner user ID<input className="field mt-1 w-full" required value={partnerIds[request.id] ?? ""} onChange={(event) => setPartnerIds((current) => ({ ...current, [request.id]: event.target.value }))} /></label><div className="flex gap-2"><button className="btn-outline" type="button" disabled={Boolean(busyId)} onClick={() => void reject(request.id)}>Reject</button><button className="btn-primary" disabled={Boolean(busyId)}>{busyId === request.id ? "Assigning…" : "Assign"}</button></div></form>)}{requests.length === 0 && <p className="p-8 text-sm text-muted">No pending delivery requests.</p>}</section></AdminShell>;
}

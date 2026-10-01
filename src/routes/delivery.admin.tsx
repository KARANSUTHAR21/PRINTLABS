import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RoleProtected } from "@/components/auth/role-protected";
import { assignDeliveryRequestFn, loadDeliveryRequests, rejectDeliveryRequestFn } from "@/lib/api/delivery";

export const Route = createFileRoute("/delivery/admin")({ component: AdminDeliveryRoute });

type RequestRow = { id: string; orderId: string; userId: string; status: string; createdAt: string };

function AdminDeliveryRoute() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [partnerIds, setPartnerIds] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function refresh() {
    const result = await loadDeliveryRequests();
    if (result.success) setRequests(result.requests);
    else setError(result.message);
  }

  useEffect(() => { void refresh(); }, []);

  async function reject(requestId: string) {
    if (busyId) return;
    setBusyId(requestId);
    setError("");
    try {
      const result = await rejectDeliveryRequestFn({ data: { requestId, reason: "Rejected by Admin" } });
      if (!result.success) setError(result.message);
      else {
        setRequests((current) => current.filter((request) => request.id !== requestId));
        setMessage("Delivery request rejected.");
      }
    } catch { setError("Could not reject this delivery request."); }
    finally { setBusyId(""); }
  }

  async function assign(requestId: string) {
    const partnerId = partnerIds[requestId]?.trim();
    if (!partnerId || busyId) return;
    setBusyId(requestId);
    setMessage("");
    try {
      const result = await assignDeliveryRequestFn({ data: { requestId, partnerId } });
      if (!result.success) setError(result.message);
      else {
        setRequests((current) => current.filter((request) => request.id !== requestId));
        setMessage(`Assigned order ${result.assignment.orderId}.`);
      }
    } catch { setMessage("Could not assign this delivery request."); }
    finally { setBusyId(""); }
  }

  return <RoleProtected allowedRoles={["ADMIN"]}><main className="container-page py-12">
    <h1 className="text-3xl font-extrabold">Delivery requests</h1>
    <p className="mt-2 text-sm text-muted">Assign only to an account whose server-side role is Delivery Partner.</p>
    {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
    {message && <p className="mt-4 text-sm" role="status">{message}</p>}
    <section className="card-surface mt-6 divide-y divide-line">
      {requests.map((request) => <form key={request.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void assign(request.id); }}>
        <div><p className="font-semibold">Order {request.orderId}</p><p className="text-xs text-muted">Requested by {request.userId}</p></div>
        <label className="text-sm">Delivery partner user ID<input className="field mt-1 w-full" required value={partnerIds[request.id] ?? ""} onChange={(event) => setPartnerIds((current) => ({ ...current, [request.id]: event.target.value }))} /></label>
        <div className="flex gap-2"><button className="btn-outline" type="button" disabled={Boolean(busyId)} onClick={() => void reject(request.id)}>Reject</button><button className="btn-primary" disabled={busyId === request.id}>{busyId === request.id ? "Assigning…" : "Assign"}</button></div>
      </form>)}
      {requests.length === 0 && <p className="p-8 text-sm text-muted">No pending delivery requests.</p>}
    </section>
  </main></RoleProtected>;
}

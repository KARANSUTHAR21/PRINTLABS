import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requestDeliveryAssignment } from "@/lib/api/delivery";
import { RoleProtected } from "@/components/auth/role-protected";

export const Route = createFileRoute("/delivery/request")({ component: DeliveryRequestRoute });
function DeliveryRequestRoute() {
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await requestDeliveryAssignment({ data: { orderId: orderId.trim() } });
      setMessage(result.success ? "Delivery requested." : result.message);
    } catch { setMessage("Could not request delivery. Check the order and try again."); }
    finally { setBusy(false); }
  }
  return <RoleProtected allowedRoles={["USER"]}><main className="container-page max-w-xl py-12"><h1 className="text-3xl font-extrabold">Request delivery</h1><p className="mt-2 text-sm text-muted">Request delivery for your own paid order. Availability depends on PrintHub service coverage.</p><form className="card-surface mt-6 grid gap-4 p-6" onSubmit={(e) => void submit(e)}><label className="text-sm font-medium">Order ID<span className="field mt-1"><input value={orderId} onChange={(e) => setOrderId(e.target.value)} required /></span></label>{message && <p role="status" className="text-sm text-muted">{message}</p>}<button className="btn-primary w-fit" disabled={busy}>{busy ? "Requesting…" : "Request delivery"}</button></form></main></RoleProtected>;
}

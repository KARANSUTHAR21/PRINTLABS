import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { adminAuditLog, adminListOrders, adminSetOrderStatus } from "@/lib/api/admin";
import type { OrderRecord } from "@/lib/server/orders";

export const Route = createFileRoute("/admin/orders")({ component: AdminOrdersRoute });
function AdminOrdersRoute() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [auditText, setAuditText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function refresh() { const result = await adminListOrders({ data: { limit: 300 } }); if (result.success) setOrders(result.orders); else setError(result.message); }
  useEffect(() => { void refresh().catch(() => setError("Could not load orders.")); }, []);
  async function status(order: OrderRecord, value: string) {
    if (!value) return; setBusy(order.id); setError("");
    try { const result = await adminSetOrderStatus({ data: { orderId: order.id, status: value as "CONFIRMED" | "PROCESSING" | "READY" | "COMPLETED" | "CANCELLED" } }); if (!result.success) setError(result.message); else await refresh(); }
    catch { setError("Could not update this order."); }
    finally { setBusy(""); }
  }
  async function audit(orderId: string) {
    const result = await adminAuditLog({ data: { orderId } });
    setAuditText(result.success ? JSON.stringify(result.events, null, 2) : result.message);
  }
  return <AdminShell><AdminPageHeading title="Orders" description="Review customer orders. Status transitions are validated against the server order lifecycle and current payment state." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface divide-y divide-line">{orders.map((order) => <article key={order.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto_auto_auto]"><div><p className="font-semibold">{order.id}</p><p className="text-xs text-muted">Customer {order.userId} · {order.items.length} item(s)</p></div><div className="text-sm">{order.paymentStatus} · {order.orderStatus}</div><select className="field min-h-9" aria-label={`New status for ${order.id}`} disabled={Boolean(busy)} defaultValue="" onChange={(event) => void status(order, event.target.value)}><option value="">Change status…</option>{["CONFIRMED", "PROCESSING", "READY", "COMPLETED", "CANCELLED"].map((value) => <option key={value}>{value}</option>)}</select><button className="btn-outline min-h-9" onClick={() => void audit(order.id)}>Audit</button></article>)}{orders.length === 0 && <p className="p-8 text-sm text-muted">No orders found.</p>}</section>{auditText && <section className="card-surface mt-5 p-4"><h2 className="font-bold">Order audit events</h2><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{auditText}</pre></section>}</AdminShell>;
}

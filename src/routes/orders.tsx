import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Protected } from "@/components/auth/protected";
import { loadOrders } from "@/lib/api/commerce";
import { formatINR } from "@/lib/money";
import type { OrderRecord } from "@/lib/server/orders";

export const Route = createFileRoute("/orders")({ component: OrdersRoute });

function OrdersRoute() {
  return (
    <Protected>
      <OrdersPage />
    </Protected>
  );
}

function OrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadOrders().then((res) => {
      if (res.success) setOrders(res.orders);
      setLoading(false);
    });
  }, []);

  return (
    <main className="container-page py-12">
      <h1 className="text-3xl font-extrabold">Orders</h1>
      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading orders...</p>
      ) : orders.length === 0 ? (
        <div className="mt-8 card-surface p-6">
          <p className="text-muted">No orders yet.</p>
          <Link to="/products" className="btn-primary mt-4">Browse products</Link>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-paper">
          {orders.map((order) => (
            <Link
              key={order.id}
              to="/orders/$orderId"
              params={{ orderId: order.id }}
              className="grid gap-3 border-b border-line p-5 last:border-b-0 hover:bg-canvas md:grid-cols-[1fr_auto_auto_auto] md:items-center"
            >
              <div>
                <p className="font-bold">{order.id}</p>
                <p className="mt-1 text-sm text-muted">
                  {order.items.length} item(s) · {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span
                className={
                  "w-fit rounded-full px-3 py-1 text-xs font-bold " +
                  (order.paymentStatus === "PAID" ? "bg-mist text-success" : "bg-canvas text-muted")
                }
              >
                {order.paymentStatus}
              </span>
              <span className="hidden text-sm text-muted md:block">
                {order.orderStatus.replace(/_/g, " ")}
              </span>
              <span className="tabular-nums font-bold">{formatINR(order.totalPaise)}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

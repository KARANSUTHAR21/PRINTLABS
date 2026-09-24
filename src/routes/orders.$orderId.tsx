import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Protected } from "@/components/auth/protected";
import { loadOrder } from "@/lib/api/commerce";
import { formatINR } from "@/lib/money";
import type { OrderRecord } from "@/lib/server/orders";

export const Route = createFileRoute("/orders/$orderId")({ component: OrderDetailsRoute });

function OrderDetailsRoute() {
  return (
    <Protected>
      <OrderDetailsPage />
    </Protected>
  );
}

function OrderDetailsPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadOrder({ data: orderId }).then((res) => {
      if (res.success) setOrder(res.order);
      else setError(res.message);
    });
  }, [orderId]);

  if (error) return <main className="container-page py-20 text-sm text-danger">{error}</main>;
  if (!order) return <main className="container-page py-20 text-sm text-muted">Loading order...</main>;

  const paid = order.paymentStatus === "PAID";

  return (
    <main className="container-page max-w-3xl py-12">
      <p className="text-sm text-muted">
        <Link to="/orders" className="text-primary">
          ← All orders
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{order.id}</h1>
          <p className="mt-1 text-sm text-muted">
            Placed {new Date(order.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex gap-2">
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-bold " +
              (paid ? "bg-mist text-success" : "bg-canvas text-muted")
            }
          >
            Payment: {order.paymentStatus}
          </span>
          <span className="rounded-full bg-canvas px-3 py-1 text-xs font-bold text-muted">
            {order.orderStatus.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <div className="card-surface mt-8 p-6">
        <h2 className="font-bold">Items</h2>
        <ul className="mt-4 divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.productId} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span>
                {item.productName}
                <span className="block text-xs text-muted">
                  {item.quantity} × {formatINR(item.unitPricePaise)}
                </span>
              </span>
              <span className="tabular-nums font-semibold">{formatINR(item.subtotalPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums text-ink">{formatINR(order.subtotalPaise)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Tax</span>
            <span className="tabular-nums text-ink">{formatINR(order.taxPaise)}</span>
          </div>
          <div className="flex justify-between pt-1 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(order.totalPaise)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {paid && order.invoiceNumber && (
          <Link to="/invoice/$orderId" params={{ orderId: order.id }} className="btn-navy">
            View invoice
          </Link>
        )}
        {!paid && order.paymentStatus !== "FAILED" && order.paymentStatus !== "EXPIRED" && (
          <Link to="/checkout" className="btn-primary">
            Return to checkout
          </Link>
        )}
        <Link to="/products" className="btn-outline">
          Continue shopping
        </Link>
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download, LoaderCircle } from "lucide-react";
import { Protected } from "@/components/auth/protected";
import { loadOrder } from "@/lib/api/commerce";
import { reconcilePayments } from "@/lib/api/maintenance";
import { formatINR } from "@/lib/money";
import type { OrderRecord } from "@/lib/server/orders";

export const Route = createFileRoute("/order-success/$orderId")({ component: OrderSuccessRoute });

function OrderSuccessRoute() {
  return (
    <Protected>
      <OrderSuccessPage />
    </Protected>
  );
}

function OrderSuccessPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firedReconcile = false;

    async function tick() {
      const res = await loadOrder({ data: orderId });
      if (stopped) return;
      if (res.success) {
        setOrder(res.order);
        // Keep polling while the payment outcome is still unknown (spec §29).
        if (
          res.order.paymentStatus !== "PAID" &&
          res.order.paymentStatus !== "FAILED" &&
          res.order.paymentStatus !== "EXPIRED" &&
          res.order.paymentStatus !== "CANCELLED"
        ) {
          if (!firedReconcile) {
            firedReconcile = true;
            void reconcilePayments();
          }
          timer = setTimeout(() => void tick(), 2500);
        }
      } else {
        setError(res.message);
      }
    }
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  if (error) return <main className="container-page py-20 text-sm text-danger">{error}</main>;
  if (!order) return <main className="container-page py-20 text-sm text-muted">Loading order...</main>;

  const paid = order.paymentStatus === "PAID";

  return (
    <main className="container-page max-w-3xl py-12">
      <div className="card-surface p-8">
        {paid ? (
          <>
            <CheckCircle2 className="size-10 text-success" />
            <h1 className="mt-4 text-3xl font-extrabold">Payment Successful</h1>
          </>
        ) : (
          <>
            <LoaderCircle className="size-10 animate-spin text-primary" />
            <h1 className="mt-4 text-3xl font-extrabold">
              {order.paymentStatus === "FAILED"
                ? "Payment Failed"
                : order.paymentStatus === "EXPIRED"
                  ? "Payment Session Expired"
                  : "We're checking your payment status."}
            </h1>
          </>
        )}
        <p className="mt-2 text-muted">
          Order {order.id} · {order.orderStatus.toLowerCase().replace(/_/g, " ")}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-canvas p-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Order ID</dt>
            <dd className="mt-0.5 font-semibold">{order.id}</dd>
          </div>
          <div>
            <dt className="text-muted">Invoice</dt>
            <dd className="mt-0.5 font-semibold">{order.invoiceNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Payment ID</dt>
            <dd className="mt-0.5 truncate font-semibold">{order.razorpayPaymentId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Order date</dt>
            <dd className="mt-0.5 font-semibold">
              {new Date(order.createdAt).toLocaleDateString("en-IN")}
            </dd>
          </div>
        </dl>

        <div className="mt-6 space-y-3 border-y border-line py-5">
          {order.items.map((item) => (
            <div key={item.productId} className="flex justify-between gap-4 text-sm">
              <span>
                {item.productName}
                <span className="block text-xs text-muted">
                  {item.quantity} × {formatINR(item.unitPricePaise)}
                </span>
              </span>
              <span className="tabular-nums font-semibold">{formatINR(item.subtotalPaise)}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-1 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums text-ink">{formatINR(order.subtotalPaise)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Tax</span>
            <span className="tabular-nums text-ink">{formatINR(order.taxPaise)}</span>
          </div>
          <div className="flex justify-between pt-1 text-lg font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(order.totalPaise)}</span>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {paid && order.invoiceNumber && (
            <>
              <Link to="/invoice/$orderId" params={{ orderId: order.id }} className="btn-navy">
                View Invoice
              </Link>
              <a href={`/api/invoices/${order.id}/pdf`} className="btn-navy">
                <Download className="size-4" />
                Download Invoice
              </a>
            </>
          )}
          {!paid && order.paymentStatus !== "FAILED" && order.paymentStatus !== "EXPIRED" && (
            <Link to="/checkout" className="btn-primary">
              Back to checkout
            </Link>
          )}
          <Link to="/orders" className="btn-outline">
            View Orders
          </Link>
          <Link to="/products" className="btn-primary">
            Continue Shopping
          </Link>
        </div>
      </div>
    </main>
  );
}

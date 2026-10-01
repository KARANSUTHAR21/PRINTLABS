import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { Protected } from "@/components/auth/protected";
import { cancelPendingOrder, loadPendingOrder } from "@/lib/api/commerce";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatINR } from "@/lib/money";
import type { OrderRecord } from "@/lib/server/orders";

export const Route = createFileRoute("/cart")({ component: CartRoute });

/**
 * The cart is per-user (server-persisted) and its "Unfinished order" block
 * exposes order data, so the page is private like /checkout and /orders.
 * Signed-out visitors are routed to /login with `next` back to /cart.
 */
function CartRoute() {
  return (
    <Protected>
      <CartPage />
    </Protected>
  );
}

function CartPage() {
  const { cart, setQty, remove, loading } = useCart();
  return (
    <main className="container-page py-12">
      <h1 className="text-3xl font-extrabold">Your Bill</h1>
      {/*
        An order can exist without a successful payment (created, payment in
        flight, failed or expired). Those are NOT orders in the Orders list —
        they are an unfinished cart, and the user must be able to SEE what is
        held and CANCEL it instead of hitting a dead end at checkout.
      */}
      <UnfinishedOrder />
      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading cart…</p>
      ) : cart.items.length === 0 ? (
        <div className="mt-8 card-surface p-8">
          <p className="text-muted">Your cart is empty.</p>
          <Link to="/products" className="btn-primary mt-4">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <ul className="space-y-4">
            {cart.items.map((item) => (
              <li key={item.productId} className="card-surface flex items-center gap-4 p-4">
                <img src={item.image} alt="" className="size-20 rounded-2xl object-cover bg-mist" />
                <div className="min-w-0 flex-1">
                  <Link to="/products/$id" params={{ id: item.productId }} className="font-semibold">
                    {item.name}
                  </Link>
                  <p className="text-sm text-muted">{formatINR(item.unitPricePaise)} each</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full border border-line"
                      onClick={() => void setQty(item.productId, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="w-8 text-center tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full border border-line"
                      onClick={() => void setQty(item.productId, item.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-muted hover:text-danger"
                      onClick={() => void remove(item.productId)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <p className="font-bold tabular-nums">{formatINR(item.linePaise)}</p>
              </li>
            ))}
          </ul>
          <aside className="card-surface h-fit p-6">
            <h2 className="font-bold">Summary</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span className="tabular-nums text-ink">{formatINR(cart.subtotalPaise)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Tax (0%)</span>
                <span className="tabular-nums text-ink">{formatINR(cart.taxPaise)}</span>
              </div>
              <div className="flex justify-between pt-2 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatINR(cart.totalPaise)}</span>
              </div>
            </div>
            <Link to="/products" className="btn-outline mt-6 w-full">
              Continue Shopping
            </Link>
            <Link to="/checkout" className="btn-navy mt-3 w-full">
              Proceed to Checkout
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}

const PENDING_NOTE: Record<string, string> = {
  CREATED: "Payment was never completed.",
  PAYMENT_INITIATED: "Payment was started but not completed.",
  PROCESSING: "A payment is still being processed.",
  FAILED: "The last payment attempt failed.",
  EXPIRED: "The last payment session expired.",
};

/** The user's unfinished checkout, with its items and a way out of it. */
function UnfinishedOrder() {
  const { user, isPending } = useCurrentUserState();
  const { refresh } = useCart();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (isPending || !user) {
      setOrder(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await loadPendingOrder();
      if (!cancelled) setOrder(res.success ? res.order : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

  async function cancel(orderId: string) {
    setCancelling(true);
    const res = await cancelPendingOrder({ data: { orderId } });
    setCancelling(false);
    if (!res.success) {
      setNotice(res.message);
      return;
    }
    setNotice(`Order ${orderId} cancelled — the items are no longer held.`);
    setOrder(null);
    await refresh();
  }

  return (
    <>
      {notice && (
        <p className="mt-6 text-sm text-muted" role="status">
          {notice}
        </p>
      )}
      {isPending || !user || !order ? null : (
        <section className="card-surface mt-8 border-primary/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">Unfinished order</h2>
              <p className="mt-1 text-sm text-muted">
                {PENDING_NOTE[order.paymentStatus] ?? "This order is awaiting payment."} These items
                are still held for you — complete the payment or cancel the order.
              </p>
            </div>
            <span className="rounded-full bg-mist px-3 py-1 text-xs font-bold text-muted">
              {order.paymentStatus.replace(/_/g, " ")}
            </span>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {order.items.map((item) => (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-4 py-2 text-sm"
              >
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
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(order.totalPaise)}</span>
          </div>
          <p className="mt-3 text-xs text-muted">Order {order.id}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/checkout" className="btn-navy">
              Complete payment
            </Link>
            <button
              type="button"
              className="btn-outline"
              disabled={cancelling}
              onClick={() => void cancel(order.id)}
            >
              {cancelling ? "Cancelling…" : "Cancel this order"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

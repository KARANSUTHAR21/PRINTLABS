import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Protected } from "@/components/auth/protected";
import { useCart } from "@/components/cart/cart-provider";
import { PaymentButton } from "@/components/payment/payment-button";
import {
  emptyCart,
  loadOrders,
  loadPaymentStatus,
  loadProfile,
  placeOrder,
} from "@/lib/api/commerce";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { newClientKey } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import type { OrderRecord } from "@/lib/server/orders";

export const Route = createFileRoute("/checkout")({ component: CheckoutRoute });

function CheckoutRoute() {
  return (
    <Protected>
      <CheckoutPage />
    </Protected>
  );
}

function CheckoutPage() {
  const user = useCurrentUser();
  const { cart, refresh } = useCart();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [resuming, setResuming] = useState<OrderRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: user?.primaryEmail ?? "",
    phone: "",
    addressLine: "",
    city: "",
    pincode: "",
  });
  const placedKey = useRef<string | null>(null);

  useEffect(() => {
    void loadProfile().then((res) => {
      if (!res.success) return;
      setForm((f) => ({
        ...f,
        firstName: res.profile.firstName || f.firstName,
        lastName: res.profile.lastName || f.lastName,
        phone: res.profile.phone ?? f.phone,
        addressLine: res.profile.addressLine ?? f.addressLine,
        city: res.profile.city ?? f.city,
        pincode: res.profile.pincode ?? f.pincode,
        email: user?.primaryEmail ?? f.email,
      }));
    });
  }, [user?.primaryEmail]);

  // Refresh behavior (spec §38): if a pending order already exists (e.g. the
  // user refreshed or came back after paying in another tab), resume it instead
  // of silently creating another one.
  useEffect(() => {
    void loadOrders().then((res) => {
      if (!res.success) return;
      const pending = res.orders.find(
        (o) =>
          o.orderStatus === "PENDING_PAYMENT" ||
          o.orderStatus === "PAYMENT_PROCESSING" ||
          o.paymentStatus === "PAID" && o.orderStatus === "CONFIRMED" && o.invoiceNumber === null,
      );
      if (!pending) return;
      if (pending.paymentStatus === "PAID") {
        setOrder(pending);
      } else if (cart.items.length === 0) {
        // Nothing left in the cart — surface the pending order so the user can
        // pay it (or abandon it from the payment step).
        setResuming(pending);
      } else if (pending.totalPaise === cart.totalPaise) {
        setOrder(pending);
      } else {
        setResuming(pending);
      }
    });
    // Run once on mount — a cart change after mount should not hijack the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await placeOrder({
      data: { idempotencyKey: newClientKey(), customer: form },
    });
    setBusy(false);
    if (!res.success) {
      setError(res.message);
      return;
    }
    placedKey.current = null;
    setOrder(res.order);
    await emptyCart();
    await refresh();
  }

  const abandon = useCallback(async () => {
    setOrder(null);
    setResuming(null);
    await refresh();
  }, [refresh]);

  if (!order && !resuming && cart.items.length === 0) {
    return (
      <main className="container-page py-16">
        <h1 className="text-3xl font-extrabold">Checkout</h1>
        <p className="mt-4 text-muted">Your cart is empty.</p>
        <Link to="/products" className="btn-primary mt-6">
          Browse products
        </Link>
      </main>
    );
  }

  if (!order && resuming) {
    return (
      <main className="container-page max-w-2xl py-16">
        <h1 className="text-3xl font-extrabold">Resume payment</h1>
        <div className="card-surface mt-6 p-6">
          <p className="text-sm text-muted">Order {resuming.id}</p>
          <p className="mt-2 text-lg font-bold tabular-nums">
            {formatINR(resuming.totalPaise)}
          </p>
          <p className="mt-3 text-sm text-muted">
            Payment status: {resuming.paymentStatus}. {CARE[resuming.paymentStatus] ?? ""}
          </p>
          <div className="mt-6">
            <PaymentButton
              orderId={resuming.id}
              amountPaise={resuming.totalPaise}
              customerName={`${form.firstName} ${form.lastName}`.trim()}
              customerEmail={form.email}
            />
          </div>
          <button type="button" className="btn-outline mt-6 w-full" onClick={() => void abandon()}>
            Start a new order instead
          </button>
        </div>
      </main>
    );
  }

  const active = order ?? resuming;
  const items = order?.items ?? cart.items.map((i) => ({
    productId: i.productId,
    productName: i.name,
    quantity: i.quantity,
    unitPricePaise: i.unitPricePaise,
    subtotalPaise: i.linePaise,
  }));
  const subtotal = active?.subtotalPaise ?? cart.subtotalPaise;
  const tax = active?.taxPaise ?? cart.taxPaise;
  const total = active?.totalPaise ?? cart.totalPaise;

  return (
    <main className="container-page grid gap-8 py-12 lg:grid-cols-[1fr_24rem]">
      <section>
        <h1 className="text-3xl font-extrabold">Checkout</h1>
        {!order ? (
          <form className="mt-8 space-y-4" onSubmit={(e) => void onPlaceOrder(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
              <Field label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
            </div>
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="Address" value={form.addressLine} onChange={(v) => setForm({ ...form, addressLine: v })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="PIN code" value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" className="btn-navy" disabled={busy}>
              {busy ? "Creating order…" : "Continue to payment"}
            </button>
          </form>
        ) : (
          <div className="mt-8 card-surface p-6">
            <p className="text-sm text-muted">Order {order.id}</p>
            <h2 className="mt-1 text-xl font-bold">Pay securely</h2>
            <p className="mt-2 text-sm text-muted">
              Amount is calculated on the server from live product prices. Completing payment
              confirms the order.
            </p>
            <div className="mt-6">
              <PaymentButton
                orderId={order.id}
                amountPaise={order.totalPaise}
                customerName={`${form.firstName} ${form.lastName}`.trim()}
                customerEmail={form.email}
              />
            </div>
          </div>
        )}
      </section>
      <aside className="card-surface h-fit p-6">
        <h2 className="font-bold">Order items</h2>
        <ul className="mt-4 space-y-3 text-sm">
          {items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-3">
              <span>
                {item.productName}
                <span className="block text-xs text-muted">× {item.quantity}</span>
              </span>
              <span className="tabular-nums">{formatINR(item.subtotalPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums text-ink">{formatINR(subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Tax (0%)</span>
            <span className="tabular-nums text-ink">{formatINR(tax)}</span>
          </div>
          <div className="flex justify-between pt-1 font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(total)}</span>
          </div>
        </div>
      </aside>
    </main>
  );
}

const CARE: Record<string, string> = {
  CREATED: "Complete the payment to confirm this order.",
  PAYMENT_INITIATED: "Complete the payment to confirm this order.",
  PROCESSING: "Your payment is being processed. Please wait.",
  FAILED: "Payment failed. Try again.",
  EXPIRED: "Your payment session expired — you can start a new attempt.",
};

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      <span className="field mt-1">
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={label !== "Address"} />
      </span>
    </label>
  );
}

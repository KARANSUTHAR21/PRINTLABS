import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import {
  abandonPayment,
  completeSandboxPayment,
  loadPaymentStatus,
  markPaymentOpen,
  startPayment,
  verifyPayment,
} from "@/lib/api/commerce";
import { newClientKey } from "@/lib/ids";
import { formatINR } from "@/lib/money";

type UiState =
  | "READY"
  | "CREATING"
  | "PAYMENT_OPEN"
  | "VERIFYING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "UNKNOWN";

const COPY: Record<UiState, string> = {
  READY: "Proceed to Payment",
  CREATING: "Creating secure payment...",
  PAYMENT_OPEN: "Complete payment securely.",
  VERIFYING: "Verifying your payment...",
  PROCESSING: "Your payment is being processed.",
  SUCCESS: "Payment Successful",
  FAILED: "Payment Failed",
  EXPIRED: "Payment Session Expired",
  UNKNOWN: "We're checking your payment status.",
};

export function PaymentButton({
  orderId,
  amountPaise,
  customerName,
  customerEmail,
  disabled,
}: {
  orderId: string;
  amountPaise: number;
  customerName: string;
  customerEmail: string;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<UiState>("READY");
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const keyRef = useRef(newClientKey());

  useEffect(() => {
    let stop = false;
    void loadPaymentStatus({ data: orderId }).then((res) => {
      if (stop || !res.success) return;
      if (res.status.paymentStatus === "PAID") {
        void navigate({ to: "/order-success/$orderId", params: { orderId } });
      } else if (res.status.paymentStatus === "PROCESSING") {
        setState("PROCESSING");
      } else if (res.status.paymentStatus === "FAILED") {
        setState("FAILED");
        keyRef.current = newClientKey();
      } else if (res.status.paymentStatus === "EXPIRED") {
        setState("EXPIRED");
        keyRef.current = newClientKey();
      }
    });
    return () => {
      stop = true;
    };
  }, [navigate, orderId]);

  async function pollUntilTerminal() {
    setState("UNKNOWN");
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await loadPaymentStatus({ data: orderId });
      if (!res.success) continue;
      const st = res.status.paymentStatus;
      if (st === "PAID") {
        setState("SUCCESS");
        void navigate({ to: "/order-success/$orderId", params: { orderId } });
        return;
      }
      if (st === "FAILED" || st === "CANCELLED") {
        setState("FAILED");
        return;
      }
      if (st === "EXPIRED") {
        setState("EXPIRED");
        return;
      }
      setState("PROCESSING");
    }
    setState("UNKNOWN");
    setMessage("Payment verification is taking longer than expected.");
  }

  async function onPay() {
    if (busy.current || disabled) return;
    busy.current = true;
    setMessage("");
    setState("CREATING");
    try {
      const created = await startPayment({
        data: { orderId, idempotencyKey: keyRef.current },
      });
      if (!created.success) {
        setState("FAILED");
        setMessage(created.message);
        return;
      }
      const session = created.session;
      setState("PAYMENT_OPEN");
      await markPaymentOpen({ data: { orderId } });

      if (session.sandbox) {
        const ok = window.confirm(
          `Pay ${formatINR(session.amountPaise)} securely for order ${orderId}?`,
        );
        if (!ok) {
          setState("FAILED");
          await abandonPayment({ data: { orderId, reason: "popup_closed" } });
          keyRef.current = newClientKey();
          return;
        }
        setState("VERIFYING");
        const done = await completeSandboxPayment({
          data: { orderId, razorpayOrderId: session.razorpayOrderId },
        });
        if (!done.success) {
          setState("UNKNOWN");
          setMessage(done.message);
          await pollUntilTerminal();
          return;
        }
        setState("SUCCESS");
        void navigate({ to: "/order-success/$orderId", params: { orderId } });
        return;
      }

      await openRazorpay({
        key: session.keyId,
        amount: session.amountPaise,
        orderId: session.razorpayOrderId,
        name: customerName,
        email: customerEmail,
        onSuccess: async (payload) => {
          setState("VERIFYING");
          const verified = await verifyPayment({
            data: {
              orderId,
              razorpayOrderId: payload.razorpay_order_id,
              razorpayPaymentId: payload.razorpay_payment_id,
              signature: payload.razorpay_signature,
            },
          });
          if (!verified.success) {
            await pollUntilTerminal();
            return;
          }
          setState("SUCCESS");
          void navigate({ to: "/order-success/$orderId", params: { orderId } });
        },
        onDismiss: async () => {
          setState("UNKNOWN");
          await pollUntilTerminal();
        },
      });
    } catch (err) {
      setState("UNKNOWN");
      setMessage(err instanceof Error ? err.message : "Could not start payment.");
      await pollUntilTerminal();
    } finally {
      busy.current = false;
    }
  }

  const label =
    state === "READY" || state === "FAILED" || state === "EXPIRED"
      ? `Pay ${formatINR(amountPaise)}`
      : COPY[state];

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn-navy w-full"
        disabled={disabled || !["READY", "FAILED", "EXPIRED"].includes(state)}
        onClick={() => void onPay()}
      >
        {["CREATING", "VERIFYING", "PROCESSING", "PAYMENT_OPEN"].includes(state) && (
          <LoaderCircle className="size-4 animate-spin" />
        )}
        {label}
      </button>
      <p className="text-center text-sm text-muted">{COPY[state]}</p>
      {message && <p className="text-center text-sm text-danger">{message}</p>}
    </div>
  );
}

async function openRazorpay(opts: {
  key: string;
  amount: number;
  orderId: string;
  name: string;
  email: string;
  onSuccess: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void | Promise<void>;
  onDismiss: () => void | Promise<void>;
}) {
  await loadRazorpay();
  const Razorpay = (window as unknown as { Razorpay: new (o: object) => { open: () => void } })
    .Razorpay;
  const rzp = new Razorpay({
    key: opts.key,
    amount: opts.amount,
    currency: "INR",
    name: "PrintHub",
    description: "PrintHub order",
    order_id: opts.orderId,
    prefill: { name: opts.name, email: opts.email },
    handler: (payload: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      void opts.onSuccess(payload);
    },
    modal: { ondismiss: () => void opts.onDismiss() },
  });
  rzp.open();
}

function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Razorpay"));
    document.head.appendChild(s);
  });
}

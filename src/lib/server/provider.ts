import { env } from "@/lib/env.server";
import { hmacSha256Hex, newId, safeEqual } from "./crypto-utils";

export type ProviderOrder = {
  id: string;
  amountPaise: number;
  currency: string;
  sandbox: boolean;
};

function razorpayKeys() {
  const keyId = env("RAZORPAY_KEY_ID");
  const keySecret = env("RAZORPAY_KEY_SECRET");
  if (keyId && keySecret) return { keyId, keySecret };
  return null;
}

export function paymentSecret(): string {
  return env("RAZORPAY_KEY_SECRET") || env("SECRET_KEY") || "printhub-sandbox-hmac";
}

export function publicKeyId(): string {
  return razorpayKeys()?.keyId ?? "rzp_test_sandbox";
}

export function isLiveRazorpay(): boolean {
  return Boolean(razorpayKeys());
}

export function signPayment(orderId: string, paymentId: string): string {
  return hmacSha256Hex(paymentSecret(), `${orderId}|${paymentId}`);
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  return safeEqual(signPayment(orderId, paymentId), signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = env("RAZORPAY_WEBHOOK_SECRET") || paymentSecret();
  return safeEqual(hmacSha256Hex(secret, rawBody), signature);
}

export async function createProviderOrder(input: {
  amountPaise: number;
  currency: string;
  receipt: string;
}): Promise<ProviderOrder> {
  const keys = razorpayKeys();
  if (!keys) {
    return {
      id: `order_sandbox_${newId("rz")}`,
      amountPaise: input.amountPaise,
      currency: input.currency,
      sandbox: true,
    };
  }
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      payment_capture: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay order failed: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id: string; amount: number; currency: string };
  if (json.amount !== input.amountPaise) {
    throw new Error("Provider amount does not match calculated total.");
  }
  return { id: json.id, amountPaise: json.amount, currency: json.currency, sandbox: false };
}

export async function fetchProviderPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  amount: number;
  orderId: string;
} | null> {
  const keys = razorpayKeys();
  if (!keys) return null;
  const auth = Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    id: string;
    status: string;
    amount: number;
    order_id: string;
  };
  return { id: json.id, status: json.status, amount: json.amount, orderId: json.order_id };
}

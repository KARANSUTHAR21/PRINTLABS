/**
 * Signed invoice-PDF links.
 *
 * The invoice PDF endpoint is session-protected (it serves whoever is signed in
 * to `GET /api/invoices/:orderId/pdf`). A link inside an EMAIL cannot rely on
 * that: the customer may open it on a device where they are not signed in, and
 * a `401` in an email is a broken link.
 *
 * So the emailed link carries its own proof: `<expiresAtMs>.<hmac>`. The
 * signature covers the order id and the expiry, so it cannot be retargeted at
 * another order, extended, or forged, and it expires on its own.
 *
 * Security notes:
 *  - HMAC-SHA256 with the app secret, namespaced by PURPOSE so a signature
 *    minted here can never be replayed as another kind of token.
 *  - Constant-time comparison (`safeEqual`).
 *  - No secret configured → no link is minted (the mail keeps its attachment
 *    rather than shipping an unauthenticated URL).
 */
import { env } from "@/lib/env.server";
import { hmacSha256Hex, safeEqual } from "./crypto-utils";

/** How long the link in an emailed invoice stays valid. */
export const INVOICE_LINK_TTL_MS = 90 * 24 * 60 * 60_000;

/** Namespace: a signature from one purpose is never valid for another. */
const PURPOSE = "invoice-pdf";

function secret(): string | null {
  return env("INVOICE_LINK_SECRET") ?? env("BETTER_AUTH_SECRET") ?? null;
}

function signature(orderId: string, expiresAtMs: number, key: string): string {
  return hmacSha256Hex(key, `${PURPOSE}|${orderId}|${expiresAtMs}`);
}

/** `<expiresAtMs>.<hmac>`, or `null` when the app has no signing secret. */
export function signInvoicePdfToken(orderId: string, expiresAtMs: number): string | null {
  const key = secret();
  if (!key) return null;
  return `${expiresAtMs}.${signature(orderId, expiresAtMs, key)}`;
}

/**
 * True when `token` is a genuine, unexpired signature for `orderId`.
 * `now` is injectable so expiry can be tested without waiting.
 */
export function verifyInvoicePdfToken(
  orderId: string,
  token: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const key = secret();
  if (!key || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expiresRaw = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  if (!/^\d{1,15}$/.test(expiresRaw) || !/^[a-f0-9]{64}$/.test(provided)) return false;
  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return false;
  return safeEqual(signature(orderId, expiresAtMs, key), provided);
}

/** Absolute, signed URL for one invoice PDF — or `null` without a secret. */
export function invoicePdfLink(
  baseUrl: string,
  orderId: string,
  now: number = Date.now(),
): string | null {
  const token = signInvoicePdfToken(orderId, now + INVOICE_LINK_TTL_MS);
  if (!token) return null;
  return `${baseUrl.replace(/\/+$/, "")}/api/invoices/${encodeURIComponent(orderId)}/pdf?t=${token}`;
}

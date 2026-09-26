/**
 * Security headers (spec Phase 9) applied to every SSR/dev response.
 *
 * - **CSP**: `script-src 'self' 'unsafe-inline'` — TanStack Start inlines the
 *   hydration payload as JSON in a `<script>` tag; per-response hashing needs
 *   a streaming transform, tracked for Phase 12. `connect-src` allows self +
 *   Razorpay's API/checkout domains (Checkout.js posts to them); `frame-src`
 *   allows Razorpay's hosted checkout iframe. `img-src` includes data: (seed
 *   product images) and Razorpay asset hosts.
 * - **frame-ancestors 'none'** — clickjacking guard. The sandbox live preview
 *   iframe is SAME-ORIGIN (the app is served from the preview host), so it is
 *   unaffected; only cross-origin embedding is refused.
 * - **nosniff, Referrer-Policy, Permissions-Policy** — baseline hardening.
 * - **HSTS** only over https (local http dev must not cache the policy).
 */

const RAZORPAY_FRAME = ["https://api.razorpay.com", "https://checkout.razorpay.com", "https://lumberjack.razorpay.com"];

export function securityHeaders(origin: string): Record<string, string> {
  const https = origin.startsWith("https://");
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.razorpay.com https://razorpay.com",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://*.ingest.sentry.io",
    "frame-src 'self' " + RAZORPAY_FRAME.join(" "),
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
    "X-Frame-Options": "DENY",
  };
  if (https) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

export function applySecurityHeaders(response: Response, origin: string): Response {
  for (const [k, v] of Object.entries(securityHeaders(origin))) {
    response.headers.set(k, v);
  }
  return response;
}

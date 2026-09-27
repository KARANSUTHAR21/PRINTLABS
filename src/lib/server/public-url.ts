/**
 * Public base URL for links we EMAIL out — password resets, invoice PDFs.
 *
 * Every absolute link in a message must point at the host the app is actually
 * served from. `FRONTEND_URL` is the intended source of truth, but a leftover
 * `http://localhost:8080` (the dev value that ships in `.env`) would make every
 * link in production dead, so a loopback value is only ever a last resort.
 *
 * Order of preference:
 *   1. a REAL (non-loopback) `FRONTEND_URL`;
 *   2. the origin the current request arrived on;
 *   3. the loopback `FRONTEND_URL`, then localhost (no request context: tests,
 *      background jobs).
 */
import { env } from "@/lib/env.server";

/** Loopback origins are a development convenience, never a production link. */
function isLoopbackOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

const trim = (value: string) => value.replace(/\/+$/, "");

/**
 * Pick the base URL for an emailed link. Pure — the request origin is passed
 * in so this is trivially testable.
 */
export function resolvePublicBaseUrl(
  configured: string | undefined,
  origin: string | null,
): string {
  const trimmed = configured?.trim() ? trim(configured.trim()) : "";
  if (trimmed && !isLoopbackOrigin(trimmed)) return trimmed;
  if (origin) return trim(origin);
  return trimmed || "http://localhost:8080";
}

/**
 * Origin of the current request, or `null` outside a request.
 *
 * Dynamically imported so this module (reachable from client-adjacent API
 * modules) never statically pulls `@tanstack/react-start/server` — and its
 * `AsyncLocalStorage` — into a browser bundle.
 */
export async function currentOrigin(): Promise<string | null> {
  try {
    const { requestOrigin } = await import("./request-origin.server");
    return requestOrigin();
  } catch {
    return null;
  }
}

/** The base URL to build emailed links from, for the current request. */
export async function publicBaseUrl(): Promise<string> {
  return resolvePublicBaseUrl(env("FRONTEND_URL"), await currentOrigin());
}

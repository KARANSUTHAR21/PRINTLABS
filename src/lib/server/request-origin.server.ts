import { getRequest } from "@tanstack/react-start/server";

/**
 * The public origin a request arrived on — **server-only** (`.server.ts` suffix).
 *
 * MUST keep the `.server` suffix: this imports `@tanstack/react-start/server`
 * (`getRequest` → Node `AsyncLocalStorage`). Importing it from a module that
 * reaches the browser bundle kills the app with
 * `AsyncLocalStorage is not a constructor` (see `auth/isolation.server.ts`).
 * Callers that are not themselves `.server.ts` should reach it with a dynamic
 * `await import()`.
 *
 * Why this exists: absolute links we email out (password reset) must point at
 * the host the app is actually served from. A hardcoded/leftover `localhost`
 * value produces links that are dead for every real user, so we prefer the
 * origin of the live request and only fall back to configuration.
 */

/** Trim trailing slashes so `${origin}/path` never doubles up. */
function trimOrigin(value: string): string {
  return value.replace(/\/+$/, "");
}

/** True when `value` is a parseable absolute http(s) origin. */
function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The origin this request came in on, or `null` when there is no request
 * context (builds, background jobs, node:test).
 *
 * Order: `Origin` (set by browsers on same-origin XHR/fetch — all server
 * functions are called this way) → `X-Forwarded-Host`/`Host` combined with
 * `X-Forwarded-Proto` (needed behind the preview/deploy proxy, where the
 * request URL is an internal address).
 */
export function requestOrigin(): string | null {
  const request = getRequest();
  if (!request) return null;
  const headers = request.headers;

  const origin = headers.get("origin");
  if (origin && isHttpOrigin(origin)) return trimOrigin(origin);

  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0]?.trim();
  if (!host) return null;
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (request.url ? new URL(request.url).protocol.replace(":", "") : "https");
  const composed = `${proto}://${host}`;
  return isHttpOrigin(composed) ? composed : null;
}

/**
 * Deployed-app (Nitro) security headers — spec Phase 9.
 *
 * Auto-registered as global h3 middleware (vite.config.ts `serverDir:
 * "./server"`). Wraps `next()` and stamps the CSP/HSTS/nosniff set onto every
 * response, both documents and API routes. Dev gets the same headers from
 * `securityHeadersPlugin` in vite.config.ts, so both environments match.
 *
 * HSTS is added only when the request arrived over https (x-forwarded-proto),
 * so local http dev never caches the policy in visitors' browsers.
 */
import { securityHeaders } from "../../src/lib/server/security-headers";

interface SecurityEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default async function securityMiddleware(
  event: SecurityEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const result = await next();
  if (result instanceof Response) {
    const proto = event.req.headers.get("x-forwarded-proto") ?? event.url.protocol.replace(":", "");
    const origin = `${proto}://${event.url.host}`;
    const headers = new Headers(result.headers);
    for (const [k, v] of Object.entries(securityHeaders(origin))) {
      headers.set(k, v);
    }
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers,
    });
  }
  return result;
}

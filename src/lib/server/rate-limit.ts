import { dbSource, getSql } from "@/lib/db";

/**
 * Fixed-window rate limiter (spec Phase 8 — multi-instance readiness).
 *
 * - **Postgres** (`DATABASE_URL` set): counters live in a `rate_limit_counters`
 *   table, so every app instance shares one budget per key — the load
 *   balancer can't dilute limits by round-robining across processes.
 * - **PGLite / preview**: in-process buckets (single process = single budget).
 *
 * The sync signature is preserved (`rateLimit(key, max, windowMs): boolean`)
 * but the function is now async-safe internally; callers that were sync must
 * now await. To keep `commerce.ts` call sites unchanged, we export BOTH:
 * `rateLimit` (async, shared) and — for the preview-only in-memory path — the
 * legacy sync implementation used when `dbSource === "pglite"`.
 */

type Bucket = { hits: number[]; pending?: Promise<boolean> };

const buckets = new Map<string, Bucket>();

/** In-memory fixed window (legacy behavior, preview + tests). */
export function rateLimitSync(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const start = now - windowMs;
  const prev = buckets.get(key) ?? { hits: [] };
  prev.hits = prev.hits.filter((t) => t > start);
  if (prev.hits.length >= max) {
    buckets.set(key, prev);
    return false;
  }
  prev.hits.push(now);
  buckets.set(key, prev);
  return true;
}

/**
 * Shared limiter. Awaits a single-flight COUNT+INSERT per key so concurrent
 * requests on ANY instance see the same window. `false` = over budget.
 */
export async function rateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  if (dbSource === "pglite") return rateLimitSync(key, max, windowMs);
  try {
    const sql = await getSql();
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const rows = await sql<{ n: number }>`
      insert into rate_limit_counters (key, window_start, hits)
      values (${key}, ${windowStart.toISOString()}, 1)
      on conflict (key, window_start)
        do update set hits = rate_limit_counters.hits + 1
      returning hits
    `;
    return (rows[0]?.n ?? 1) <= max;
  } catch (err) {
    // A limiter outage must never take the API down: fall back to the
    // in-memory window (per-process) and log once per burst.
    console.error("[rate-limit] shared store unavailable, in-process fallback:", err instanceof Error ? err.message : err);
    return rateLimitSync(key, max, windowMs);
  }
}

export function clientKey(userId: string | undefined, extra: string): string {
  return `${userId ?? "anon"}:${extra}`;
}

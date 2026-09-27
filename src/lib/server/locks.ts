import { dbSource, getLockPool } from "@/lib/db";

/**
 * Cross-process locks (spec Phase 8 — multi-instance readiness).
 *
 * - **Postgres** (`DATABASE_URL` set): session-level **advisory locks** on a
 *   dedicated pooled connection. Two app instances behind a load balancer
 *   serialize on the same `payment_lock:<orderId>` key with zero new infra.
 *   A crashed holder auto-releases when its connection closes.
 * - **PGLite** (preview, single process): an in-process mutex — with exactly
 *   one process, a mutex IS the cross-process lock, and advisory locks would
 *   need a second PGLite client to hold them.
 *
 * Correctness never depended on the lock: the DB unique constraints
 * (`payment_attempts_active_order`, `orders.razorpay_order_id`) decide who
 * wins. The lock only prevents duplicate provider-order calls racing.
 */

/** Namespace tag — isolates this app's locks from other clients' locks. */
const LOCK_NAMESPACE = "printhub:lock:v1:";

/**
 * Deterministic 64-bit key — every instance must derive the SAME number.
 *
 * `pg_try_advisory_lock` takes a **signed** bigint, so the FNV-1a hash is
 * masked to its low 63 bits (max 9.22e18). The previous form
 * (`0x70680001 << 40` ≈ 2.07e21) overflowed that range, so Postgres rejected
 * every call with `value "2073529328098221653411" is out of range for type
 * bigint` — which surfaced as a hard payment failure on the Postgres path
 * (PGLite uses the in-process mutex and never noticed).
 */
export function lockId(key: string): string {
  const input = `${LOCK_NAMESPACE}${key}`;
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i += 1) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return (h & 0x7fffffffffffffffn).toString();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Serialize `fn` on `key`. `timeoutMs` bounds how long a caller waits for a
 * peer — on timeout the promise REJECTS (callers surface a retryable error);
 * `fn` is never run unlocked.
 */
export async function withLock<T>(key: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  if (dbSource === "pglite") return withMutex(key, timeoutMs, fn);
  return withAdvisoryLock(key, timeoutMs, fn);
}

// ── Postgres: session-level advisory locks ───────────────────────────────────

async function withAdvisoryLock<T>(key: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  const pool = getLockPool();
  if (!pool) throw new Error("Lock pool unavailable.");
  const client = await pool.connect();
  const id = lockId(key);
  let locked = false;
  const deadline = Date.now() + timeoutMs;
  try {
    // Poll-acquire: plain `pg_advisory_lock` blocks unbounded, which could
    // wedge a pooled connection past the caller's patience.
    for (;;) {
      const res = await client.query<{ locked: boolean }>(
        "select pg_try_advisory_lock($1) as locked",
        [id],
      );
      if (res.rows[0]?.locked) {
        locked = true;
        break;
      }
      if (Date.now() > deadline) {
        throw new Error("Could not acquire payment lock — try again.");
      }
      await sleep(50);
    }
    return await fn();
  } finally {
    if (locked) {
      try {
        await client.query("select pg_advisory_unlock($1)", [id]);
      } catch {
        /* connection is closing anyway */
      }
    }
    client.release();
  }
}

// ── PGLite: in-process mutex (preview) ───────────────────────────────────────

const mutexes = new Map<string, Promise<void>>();

async function withMutex<T>(key: string, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  // Chain onto any prior holder of this key.
  for (;;) {
    const prior = mutexes.get(key);
    if (!prior) break;
    await Promise.race([prior, sleep(25)]);
    if (Date.now() > deadline) throw new Error("Could not acquire payment lock — try again.");
  }
  let release!: () => void;
  const lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  mutexes.set(key, lock);
  try {
    return await fn();
  } finally {
    mutexes.delete(key);
    release();
  }
}

/** Test-only surface: current mutex map size (used by the locks test). */
export function __mutexCountFor(key: string): boolean {
  return mutexes.has(key);
}

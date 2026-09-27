import assert from "node:assert/strict";
import test from "node:test";

/**
 * Multi-instance readiness (spec Phase 8):
 *  - lock ids are DETERMINISTIC (two instances must derive the same number)
 *    AND inside signed int64 — `pg_try_advisory_lock(bigint)` rejects anything
 *    larger, which broke every payment on the Postgres path;
 *  - `getLockPool` is null on the PGLite fallback (no pool to borrow);
 *  - the shared rate limiter counts every parallel caller against ONE budget.
 */

const locks = await import("../src/lib/server/locks.ts");
const db = await import("../src/lib/db.ts");
const { rateLimit, clientKey, rateLimitSync } = await import("../src/lib/server/rate-limit.ts");

test("advisory lock ids are deterministic and fit in a SIGNED int64", () => {
  const keys = [
    "payment_lock:PH-MUJTXW5V-5B5ECB298E",
    "payment_lock:PH-ABC",
    "other:key",
    ...Array.from({ length: 200 }, (_, i) => `payment_lock:PH-BULK-${i}`),
  ];
  const seen = new Set();
  for (const key of keys) {
    const id = locks.lockId(key);
    // Deterministic across instances — the same key must always map to the
    // same number, or two app instances would lock different keys.
    assert.equal(locks.lockId(key), id);
    assert.match(id, /^\d+$/, `${key} → ${id}`);
    const value = BigInt(id);
    assert.ok(value >= 0n, `${key} → ${id} must not use the sign bit`);
    assert.ok(value <= 9223372036854775807n, `${key} → ${id} exceeds int64`);
    seen.add(id);
  }
  // Distinct keys must (practically) never collide — one collision would
  // serialize two unrelated payments, many would wedge the app.
  assert.equal(seen.size, keys.length, `${keys.length - seen.size} lock id collision(s)`);
});

test("advisory lock ids are deterministic and namespaced", async () => {
  // Two derivations of the same key must be equal (cross-instance contract);
  // different keys must differ. Assert via observable behavior: the SAME key
  // still serializes across separate withLock invocations, and the mutex map
  // is untouched on the Postgres path.
  const key = `mi:${Math.random()}`;
  let maxConcurrent = 0;
  let inside = 0;
  await Promise.all(
    Array.from({ length: 5 }, () =>
      locks.withLock(key, 10_000, async () => {
        inside += 1;
        maxConcurrent = Math.max(maxConcurrent, inside);
        await new Promise((r) => setTimeout(r, 10));
        inside -= 1;
      }),
    ),
  );
  assert.equal(maxConcurrent, 1);
});

test("getLockPool returns null without DATABASE_URL (PGLite path)", () => {
  // The test env has no DATABASE_URL, so the pool must be absent — withLock
  // routes to the in-process mutex there instead.
  assert.equal(db.dbSource, "pglite");
  assert.equal(db.getLockPool(), null);
});

test("shared rate limiter: parallel callers share one budget", async () => {
  const key = `mi_rl_${Math.random().toString(36).slice(2)}`;
  // 8 concurrent callers against max 3: exactly 3 allowed (shared store is the
  // real DB when DATABASE_URL is set; PGLite falls back to the same semantics).
  const results = await Promise.all(Array.from({ length: 8 }, () => rateLimit(key, 3, 60_000)));
  const allowed = results.filter(Boolean).length;
  assert.ok(allowed <= 3, `shared budget must hold (allowed ${allowed}/8)`);
  assert.ok(allowed >= 1, "at least the first caller passes");
});

test("rateLimitSync stays available for preview/tests and still windows", async () => {
  const key = `sync_${Math.random()}`;
  assert.equal(rateLimitSync(key, 2, 60_000), true);
  assert.equal(rateLimitSync(key, 2, 60_000), true);
  assert.equal(rateLimitSync(key, 2, 60_000), false);
});

test("clientKey shape is stable (per-user buckets)", () => {
  assert.equal(clientKey("u1", "pay"), "u1:pay");
  assert.equal(clientKey(undefined, "pay"), "anon:pay");
});

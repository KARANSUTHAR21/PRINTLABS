import assert from "node:assert/strict";
import test from "node:test";

/**
 * Concurrency invariants at the data layer (spec Phase 4, no HTTP server).
 *
 * The DB schema is the arbiter — unique constraints
 * (`payment_attempts_active_order`, `orders.razorpay_order_id`) plus the
 * transition guards decide winners. These tests hammer `withLock` and the
 * idempotency store with parallel callers and assert exactly-one semantics:
 *  - N parallel `withLock`s on one key run `fn` strictly serially.
 *  - A lock wait past the timeout rejects; it never runs `fn` unlocked.
 *  - Parallel idempotent writes converge to one stored response.
 */

const { withLock } = await import("../src/lib/server/locks.ts");
const { getSql } = await import("../src/lib/db.ts");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("withLock serializes parallel callers on the same key", async () => {
  const key = `test:${Math.random()}`;
  let inside = 0;
  let maxConcurrent = 0;
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      withLock(key, 10_000, async () => {
        inside += 1;
        maxConcurrent = Math.max(maxConcurrent, inside);
        await sleep(15); // hold the lock long enough to overlap if broken
        inside -= 1;
        return i;
      }),
    ),
  );
  assert.equal(maxConcurrent, 1, "critical section must never overlap");
  assert.deepEqual(
    results.sort((a, b) => a - b),
    Array.from({ length: 10 }, (_, i) => i),
    "every caller completes exactly once",
  );
});

test("withLock allows disjoint keys to run concurrently", async () => {
  const releaseA = (() => {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve: () => resolve() };
  })();
  let aEntered = false;
  const a = withLock(`ka:${Math.random()}`, 10_000, async () => {
    aEntered = true;
    await releaseA.promise;
  });
  await sleep(60);
  const b = withLock(`kb:${Math.random()}`, 10_000, async () => "b-done");
  assert.equal(await b, "b-done", "a different key must not block");
  assert.ok(aEntered, "holder A is inside its section");
  releaseA.resolve();
  await a;
});

test("withLock rejects on timeout without running fn unlocked", async () => {
  const key = `test:${Math.random()}`;
  let ran = 0;
  const holder = withLock(key, 30_000, () => sleep(1500));
  await sleep(80); // let the holder take the lock
  await assert.rejects(
    () => withLock(key, 100, () => { ran += 1; return Promise.resolve("x"); }),
    /Could not acquire payment lock/,
  );
  assert.equal(ran, 0, "a timed-out caller must never run its critical section");
  await holder;
});

test("parallel idempotent writes converge to one response", async () => {
  const sql = await getSql();
  const { writeIdempotent, readIdempotent } = await import("../src/lib/server/idempotency.ts");
  const key = `stress_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const body = { orderId: "PH-STRESS-1" };
  const response = { order: { id: "PH-STRESS-1", totalPaise: 200 } };
  // 8 writers race with the SAME key: one inserts, the rest no-op.
  await Promise.all(
    Array.from({ length: 8 }, () =>
      writeIdempotent(sql, key, "stress_user", "POST /api/orders", body, response),
    ),
  );
  const read = await readIdempotent(
    sql, key, "stress_user", "POST /api/orders", body,
  );
  assert.deepEqual(read, response, "exactly one stored response wins");
  // A different body under the same key must be rejected, not silently merged.
  await assert.rejects(() =>
    readIdempotent(sql, key, "stress_user", "POST /api/orders", { orderId: "PH-OTHER" }),
  );
});

test("stock reservation decrements never go negative under parallel checkout", async () => {
  const sql = await getSql();
  const productId = `stress_prd_${Date.now()}`;
  await sql`
    insert into products (id, name, slug, description, category, price_paise, image, stock)
    values (${productId}, 'Stress Product', ${"stress-" + productId}, 'x', 'Paper & Printing', 100, '/images/x.jpg', 5)
    on conflict (id) do nothing
  `;
  // 10 buyers, 1 unit each, 5 in stock: the guard clause decides winners.
  const outcomes = await Promise.all(
    Array.from({ length: 10 }, () =>
      sql`
        update products set stock = stock - 1
        where id = ${productId} and stock >= 1
        returning id
      `.then((r) => r.length),
    ),
  );
  const winners = outcomes.reduce((s, n) => s + n, 0);
  assert.equal(winners, 5, "exactly the available stock is sold, no oversell");
  const left = await sql`
    select stock from products where id = ${productId}
  `;
  assert.equal(left[0]?.stock, 0);
  await sql`delete from products where id = ${productId}`;
});

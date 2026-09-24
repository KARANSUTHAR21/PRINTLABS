import assert from "node:assert/strict";
import test from "node:test";

/**
 * Idempotency reuse semantics (spec §21): the same key + same request replays
 * the stored response; the same key with a DIFFERENT request, or another
 * user's key, must be rejected rather than silently returning someone else's
 * result. Tested against a fake `Sql` so no database is needed.
 */

const { readIdempotent } = await import("../src/lib/server/idempotency.ts");
const { hashIdempotency } = await import("../src/lib/server/crypto-utils.ts");

/** Minimal fake of the shared Sql surface: tagged template returns canned rows. */
function fakeSql(rows) {
  const fn = async () => rows;
  fn.query = async () => rows;
  return fn;
}

test("hashIdempotency is deterministic and body-sensitive", () => {
  const a = hashIdempotency("POST /api/orders", { customer: { city: "Pune" } });
  const b = hashIdempotency("POST /api/orders", { customer: { city: "Pune" } });
  const c = hashIdempotency("POST /api/orders", { customer: { city: "Nashik" } });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("same key + same request replays the stored response", async () => {
  const stored = {
    user_id: "u1",
    endpoint: "POST /api/orders",
    request_hash: hashIdempotency("POST /api/orders", { customer: {} }),
    response: JSON.stringify({ order: { id: "PH-1" } }),
  };
  const sql = fakeSql([stored]);
  const replay = await readIdempotent(sql, "key-1", "u1", "POST /api/orders", { customer: {} });
  assert.deepEqual(replay, { order: { id: "PH-1" } });
});

test("same key reused with a different request body is rejected", async () => {
  const stored = {
    user_id: "u1",
    endpoint: "POST /api/orders",
    request_hash: hashIdempotency("POST /api/orders", { customer: {} }),
    response: JSON.stringify({ order: { id: "PH-1" } }),
  };
  const sql = fakeSql([stored]);
  await assert.rejects(
    () => readIdempotent(sql, "key-1", "u1", "POST /api/orders", { customer: { city: "X" } }),
    /reused with a different request/,
  );
});

test("another user's idempotency key is rejected (no cross-user replay)", async () => {
  const stored = {
    user_id: "u2",
    endpoint: "POST /api/orders",
    request_hash: hashIdempotency("POST /api/orders", { customer: {} }),
    response: JSON.stringify({ order: { id: "PH-2" } }),
  };
  const sql = fakeSql([stored]);
  await assert.rejects(
    () => readIdempotent(sql, "key-2", "u1", "POST /api/orders", { customer: {} }),
    /already used/,
  );
});

test("same key on a different endpoint is rejected", async () => {
  const stored = {
    user_id: "u1",
    endpoint: "POST /api/payments/create-order",
    request_hash: hashIdempotency("POST /api/payments/create-order", { orderId: "PH-1" }),
    response: JSON.stringify({ session: {} }),
  };
  const sql = fakeSql([stored]);
  await assert.rejects(
    () => readIdempotent(sql, "key-3", "u1", "POST /api/orders", { customer: {} }),
    /already used/,
  );
});

test("unknown key returns null (first request proceeds)", async () => {
  const sql = fakeSql([]);
  const result = await readIdempotent(sql, "key-4", "u1", "POST /api/orders", { customer: {} });
  assert.equal(result, null);
});

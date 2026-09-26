import assert from "node:assert/strict";
import test from "node:test";

/**
 * Payment security basics (spec §66/§73): signature verification rejects
 * tampered payloads, HMAC signing is deterministic, and rate limiting blocks
 * bursts. These guard the DB-bound payment paths.
 */

const provider = await import("../src/lib/server/provider.ts");
const crypto = await import("../src/lib/server/crypto-utils.ts");
const { rateLimit } = await import("../src/lib/server/rate-limit.ts");

test("payment signature verifies only for the exact order+payment pair", () => {
  const sig = provider.signPayment("order_123", "pay_456");
  assert.equal(provider.verifyPaymentSignature("order_123", "pay_456", sig), true);
  assert.equal(provider.verifyPaymentSignature("order_999", "pay_456", sig), false); // wrong order
  assert.equal(provider.verifyPaymentSignature("order_123", "pay_000", sig), false); // wrong payment
  assert.equal(provider.verifyPaymentSignature("order_123", "pay_456", "deadbeef"), false); // tampered
});

test("webhook signature is body-sensitive", () => {
  const body = JSON.stringify({ event: "payment.captured" });
  const good = crypto.hmacSha256Hex(provider.paymentSecret(), body);
  assert.equal(provider.verifyWebhookSignature(body, good), true);
  const tampered = JSON.stringify({ event: "payment.captured", amount: 100 });
  assert.equal(provider.verifyWebhookSignature(tampered, good), false);
});

test("signPayment is deterministic and differs per payment id", () => {
  const a1 = provider.signPayment("o1", "p1");
  const a2 = provider.signPayment("o1", "p1");
  const b = provider.signPayment("o1", "p2");
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
});

test("safeEqual is constant-ish and correct", () => {
  assert.equal(crypto.safeEqual("abc", "abc"), true);
  assert.equal(crypto.safeEqual("abc", "abd"), false);
  assert.equal(crypto.safeEqual("abc", "abcd"), false);
});

test("password reset tokens are unique and hashed stably", () => {
  const t1 = crypto.randomToken(32);
  const t2 = crypto.randomToken(32);
  assert.notEqual(t1, t2);
  assert.equal(crypto.sha256(t1), crypto.sha256(t1));
  assert.notEqual(crypto.sha256(t1), crypto.sha256(t2));
});

test("order ids are public-format and collision-resistant", () => {
  const ids = new Set();
  for (let i = 0; i < 200; i += 1) {
    const id = crypto.newPublicOrderId();
    // PH-<base36 timestamp>-<10 hex chars> — never a hash (Razorpay receipt cap
    // is 40 chars), and the 40-bit random suffix makes enumeration infeasible.
    assert.match(id, /^PH-[A-Z0-9]+-[A-F0-9]{10}$/);
    assert.ok(id.length <= 40, "must stay within the Razorpay receipt length cap");
    ids.add(id);
  }
  assert.equal(ids.size, 200);
});

test("rate limiter allows the burst then blocks", async () => {
  const key = `test:${Math.random()}`;
  let allowed = 0;
  for (let i = 0; i < 15; i += 1) {
    // rateLimit is async (shared Postgres counter, Phase 8) — await each hit.
    if (await rateLimit(key, 5, 60_000)) allowed += 1;
  }
  assert.equal(allowed, 5);
});

test("rate limiter window expires", async () => {
  const key = `test-window:${Math.random()}`;
  for (let i = 0; i < 5; i += 1) await rateLimit(key, 5, 30);
  await new Promise((r) => setTimeout(r, 45));
  assert.equal(await rateLimit(key, 5, 30), true);
});

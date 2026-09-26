import assert from "node:assert/strict";
import test from "node:test";

/**
 * Webhook pipeline verification without the network (spec Phase 3, testable
 * half). Raw fixture bodies are signed with the SAME HMAC scheme Razorpay
 * uses (`HMAC-SHA256(webhook_secret, raw_body)`), then pushed through
 * `handleWebhook` against the real PGLite database — signature matrix,
 * unknown-order tolerance, duplicate-event dedup, and the captured → PAID +
 * invoice convergence.
 *
 * The DB is the app's own bootstrap (`getSql()` → PGLite with migrations),
 * so this exercises the true idempotency constraints, not mocks.
 */

const { handleWebhook } = await import("../src/lib/server/payments.ts");
const provider = await import("../src/lib/server/provider.ts");
const { getSql } = await import("../src/lib/db.ts");
const { createHmac } = await import("node:crypto");

// Force the sandbox HMAC secret so signatures are deterministic in tests.
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "whsec_test_suite";

/** Sign a raw body exactly like Razorpay's dashboard does. */
function signBody(raw, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

const captureFixture = (overrides = {}) =>
  JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_fixture_001",
          order_id: "order_fixture_001",
          amount: 200,
          currency: "INR",
          status: "captured",
          ...overrides,
        },
      },
    },
  });

test("webhook rejects a missing or tampered signature", async () => {
  const raw = captureFixture();
  await assert.rejects(
    () => handleWebhook(raw, null),
    /Invalid webhook signature/,
  );
  await assert.rejects(
    () => handleWebhook(raw, signBody(JSON.stringify({ tampered: true }))),
    /Invalid webhook signature/,
  );
  await assert.rejects(() => handleWebhook(raw, "deadbeef"), /Invalid webhook signature/);
});

test("webhook accepts a correctly signed capture and converges to PAID + one invoice", async () => {
  const sql = await getSql();
  // Seed: user + order (PAID-bound) + a PAYMENT_INITIATED attempt pointing at
  // the provider order id the fixture carries.
  const userId = "wh_user_1";
  await sql`
    insert into user_profiles (user_id, first_name, last_name)
    values (${userId}, 'Web', 'Hook')
    on conflict (user_id) do nothing
  `;
  const orderId = "PH-WHTEST1-DEADBEEF";
  await sql`delete from invoices where order_id = ${orderId}`;
  await sql`delete from order_items where order_id = ${orderId}`;
  await sql`delete from payment_attempts where order_id = ${orderId}`;
  await sql`delete from orders where id = ${orderId}`;
  await sql`
    insert into orders (id, user_id, subtotal_paise, tax_paise, total_paise, currency,
                        payment_status, order_status, customer_snapshot)
    values (${orderId}, ${userId}, 200, 0, 200, 'INR', 'PAYMENT_INITIATED', 'PAYMENT_PROCESSING',
            ${JSON.stringify({ email: "wh.tester@example.com", firstName: "Web", lastName: "Hook" })}::jsonb)
  `;
  await sql`
    insert into payment_attempts (id, order_id, user_id, attempt_number, idempotency_key,
                                  razorpay_order_id, amount_paise, currency, status, expires_at)
    values ('pay_wh_1', ${orderId}, ${userId}, 1, 'wh_key_1', 'order_fixture_001', 200, 'INR',
            'PAYMENT_INITIATED', ${new Date(Date.now() + 600_000).toISOString()})
  `;
  await sql`update orders set active_payment_attempt_id = 'pay_wh_1' where id = ${orderId}`;

  const raw = captureFixture();
  const first = await handleWebhook(raw, signBody(raw));
  assert.equal(first.ok, true);
  const orderRow = (
    await sql`select payment_status, order_status from orders where id = ${orderId} limit 1`
  )[0];
  assert.equal(orderRow.payment_status, "PAID");
  assert.equal(orderRow.order_status, "CONFIRMED");
  const invoices = await sql`
    select invoice_number from invoices where order_id = ${orderId}
  `;
  assert.equal(invoices.length, 1, "exactly one invoice after the first capture");

  // Replay the SAME event: webhook_events' unique provider_event_id dedups.
  const raw2 = captureFixture();
  const eventKey = `${captureFixture()}`; // same body → same derived event id
  const second = await handleWebhook(raw2, signBody(raw2));
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true, "replay must be recognized as a duplicate");
  const invoicesAfterReplay = await sql`
    select invoice_number from invoices where order_id = ${orderId}
  `;
  assert.equal(
    invoicesAfterReplay.length,
    1,
    "replaying the capture must not mint a second invoice",
  );
});

test("webhook ignores unknown provider orders without failing", async () => {
  const raw = captureFixture({ order_id: "order_unknown_999", id: "pay_unknown_999" });
  const result = await handleWebhook(raw, signBody(raw));
  assert.equal(result.ok, true);
});

test("webhook marks attempts failed on payment.failed", async () => {
  const sql = await getSql();
  const userId = "wh_user_1";
  const orderId = "PH-WHFAIL1-CAFEBABE";
  await sql`delete from payment_attempts where order_id = ${orderId}`;
  await sql`delete from orders where id = ${orderId}`;
  await sql`
    insert into orders (id, user_id, subtotal_paise, tax_paise, total_paise, currency,
                        payment_status, order_status, customer_snapshot)
    values (${orderId}, ${userId}, 100, 0, 100, 'INR', 'PAYMENT_INITIATED', 'PAYMENT_PROCESSING', '{}'::jsonb)
  `;
  await sql`
    insert into payment_attempts (id, order_id, user_id, attempt_number, idempotency_key,
                                  razorpay_order_id, amount_paise, currency, status, expires_at)
    values ('pay_wh_2', ${orderId}, ${userId}, 1, 'wh_key_2', 'order_fixture_fail', 100, 'INR',
            'PAYMENT_INITIATED', ${new Date(Date.now() + 600_000).toISOString()})
  `;
  await sql`update orders set active_payment_attempt_id = 'pay_wh_2' where id = ${orderId}`;
  const raw = JSON.stringify({
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "pay_fixture_fail",
          order_id: "order_fixture_fail",
          amount: 100,
          status: "failed",
        },
      },
    },
  });
  const result = await handleWebhook(raw, signBody(raw));
  assert.equal(result.ok, true);
  const attempt = (
    await sql`select status from payment_attempts where id = 'pay_wh_2' limit 1`
  )[0];
  assert.equal(attempt.status, "FAILED");
});

test("webhook rejects malformed JSON even with a valid signature", async () => {
  await assert.rejects(() => handleWebhook("not-json{{", signBody("not-json{{")), /Invalid webhook payload/);
});

test("verifyWebhookSignature matches the documented HMAC scheme", () => {
  const raw = '{"event":"ping"}';
  const sig = signBody(raw);
  assert.equal(provider.verifyWebhookSignature(raw, sig), true);
  assert.equal(provider.verifyWebhookSignature(raw + " ", sig), false);
});

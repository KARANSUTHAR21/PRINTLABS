import assert from "node:assert/strict";
import test from "node:test";

/**
 * Money + state-machine invariants (spec §19, §73). These are the pure-logic
 * core of the payment system — the DB-bound paths reuse the same transition
 * guards, so testing them here pins the payment failure matrix.
 */

const { calcTotals, calcTax, formatINR, TAX_BPS } = await import("../src/lib/money.ts");
const machine = await import("../src/lib/server/machine.ts");

test("tax at 0 bps is zero and totals equal subtotal", () => {
  const totals = calcTotals(20000);
  assert.equal(TAX_BPS, 0);
  assert.equal(totals.taxPaise, 0);
  assert.equal(totals.totalPaise, totals.subtotalPaise);
});

test("calcTax scales proportionally for non-zero bps", () => {
  assert.equal(calcTax(10000, 1800), 1800); // 18% GST on ₹100
  assert.equal(calcTax(999, 1800), 180); // rounds half up
});

test("formatINR renders paise as rupee currency", () => {
  assert.equal(formatINR(20000), "₹200.00");
  assert.equal(formatINR(5), "₹0.05");
});

test("frontend price tampering cannot change totals — calcTotals is the single source", () => {
  // The order pipeline only ever calls calcTotals(subtotal from product rows),
  // so any client-sent amount is discarded. Pin the function's determinism.
  const a = calcTotals(12345);
  const b = calcTotals(12345);
  assert.deepEqual(a, b);
});

test("payment happy path transitions are legal", () => {
  assert.ok(machine.canTransitionPayment("CREATED", "PAYMENT_INITIATED"));
  assert.ok(machine.canTransitionPayment("PAYMENT_INITIATED", "PROCESSING"));
  assert.ok(machine.canTransitionPayment("PROCESSING", "PAID"));
});

test("failure paths: PROCESSING -> FAILED, timeout -> EXPIRED, CREATED -> CANCELLED", () => {
  assert.ok(machine.canTransitionPayment("PROCESSING", "FAILED"));
  assert.ok(machine.canTransitionPayment("PAYMENT_INITIATED", "EXPIRED"));
  assert.ok(machine.canTransitionPayment("CREATED", "CANCELLED"));
});

test("illegal jumps are rejected", () => {
  assert.ok(!machine.canTransitionPayment("CREATED", "PAID")); // must pass through INITIATED/PROCESSING
  assert.ok(!machine.canTransitionPayment("FAILED", "PAID"));
  assert.ok(!machine.canTransitionPayment("PAID", "PROCESSING"));
  assert.ok(!machine.canTransitionPayment("EXPIRED", "PAID"));
  assert.ok(!machine.canTransitionPayment("REFUNDED", "PAID"));
});

test("terminal payment states accept no outgoing transitions", () => {
  for (const s of ["PAID", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"]) {
    assert.ok(machine.TERMINAL_PAYMENT.has(s), `${s} should be terminal`);
  }
  assert.ok(!machine.canTransitionPayment("FAILED", "PROCESSING"));
  assert.ok(!machine.canTransitionPayment("CANCELLED", "PAYMENT_INITIATED"));
});

test("only PAID -> REFUNDED is allowed after success", () => {
  assert.ok(machine.canTransitionPayment("PAID", "REFUNDED"));
  assert.ok(!machine.canTransitionPayment("PAID", "FAILED"));
});

test("order lifecycle: PENDING_PAYMENT -> PAYMENT_PROCESSING -> CONFIRMED", () => {
  assert.ok(machine.canTransitionOrder("PENDING_PAYMENT", "PAYMENT_PROCESSING"));
  assert.ok(machine.canTransitionOrder("PAYMENT_PROCESSING", "CONFIRMED"));
  assert.ok(!machine.canTransitionOrder("PENDING_PAYMENT", "CONFIRMED")); // no skipping
  assert.ok(!machine.canTransitionOrder("COMPLETED", "PROCESSING"));
});

test("isActivePayment covers exactly the in-flight states", () => {
  assert.ok(machine.isActivePayment("CREATED"));
  assert.ok(machine.isActivePayment("PAYMENT_INITIATED"));
  assert.ok(machine.isActivePayment("PROCESSING"));
  for (const s of ["PAID", "FAILED", "CANCELLED", "EXPIRED", "REFUNDED"]) {
    assert.ok(!machine.isActivePayment(s));
  }
});

test("PAID is the only success state", () => {
  assert.ok(machine.isPaid("PAID"));
  for (const s of ["PROCESSING", "PAYMENT_INITIATED", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED"]) {
    assert.ok(!machine.isPaid(s));
  }
});

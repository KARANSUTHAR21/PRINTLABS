import assert from "node:assert/strict";
import test from "node:test";

/**
 * What counts as an ORDER vs an unfinished checkout (spec request):
 *  - `listOrders` returns ONLY orders whose payment SUCCEEDED — an order that
 *    was merely created, is awaiting payment, or whose payment failed/expired
 *    is not in the user's Orders list;
 *  - `pendingOrderForUser` returns that unpaid order WITH its items, so the
 *    cart can show exactly what is held and offer paying or cancelling it;
 *  - a CANCELLED order is settled business and belongs to neither list;
 *  - `sameCartLines` decides whether an unfinished order still matches the
 *    current cart (the rule `createOrderFromCart` enforces).
 *
 * Runs against the PGLite database (`DATABASE_URL` unset), same as the rest of
 * the suite.
 */

const { listOrders, pendingOrderForUser, sameCartLines } = await import(
  "../src/lib/server/orders.ts"
);
const { getSql } = await import("../src/lib/db.ts");

const RUN = Math.random().toString(36).slice(2, 8);

async function insertOrder(sql, id, paymentStatus, orderStatus, items) {
  const subtotal = items.reduce((sum, i) => sum + i.subtotalPaise, 0);
  await sql`
    insert into orders (
      id, user_id, subtotal_paise, tax_paise, total_paise, currency,
      payment_status, order_status, customer_snapshot
    ) values (
      ${id}, ${`usr_${RUN}`}, ${subtotal}, 0, ${subtotal}, 'INR',
      ${paymentStatus}, ${orderStatus}, '{}'::jsonb
    )
  `;
  for (const [index, item] of items.entries()) {
    await sql`
      insert into order_items (
        id, order_id, product_id, product_name, quantity, unit_price_paise, subtotal_paise
      ) values (
        ${`oi_${id}_${index}`}, ${id}, ${item.productId}, ${item.productName},
        ${item.quantity}, ${item.unitPricePaise}, ${item.subtotalPaise}
      )
    `;
  }
}

const line = (productId, productName, quantity, unitPricePaise = 200) => ({
  productId,
  productName,
  quantity,
  unitPricePaise,
  subtotalPaise: quantity * unitPricePaise,
});

test("listOrders returns only orders whose payment succeeded", async () => {
  const sql = await getSql();
  const paid = `PH-PAID-${RUN}`;
  await insertOrder(sql, paid, "PAID", "CONFIRMED", [line("prd_a4", "A4 Print Paper", 2)]);
  await insertOrder(sql, `PH-CREATED-${RUN}`, "CREATED", "PENDING_PAYMENT", [
    line("prd_a4", "A4 Print Paper", 2),
  ]);
  await insertOrder(sql, `PH-CANCELLED-${RUN}`, "CANCELLED", "CANCELLED", [
    line("prd_a4", "A4 Print Paper", 1),
  ]);

  const orders = await listOrders(`usr_${RUN}`);
  assert.deepEqual(
    orders.map((o) => o.id),
    [paid],
    "only the paid order is an order",
  );
});

test("pendingOrderForUser returns the unpaid order WITH its items", async () => {
  const sql = await getSql();
  const created = `PH-PENDING-${RUN}`;
  await insertOrder(sql, created, "CREATED", "PENDING_PAYMENT", [
    line("prd_a4", "A4 Print Paper", 2),
    line("prd_card", "Greeting Card", 3),
  ]);

  const pending = await pendingOrderForUser(`usr_${RUN}`);
  assert.equal(pending?.id, created);
  assert.deepEqual(
    pending.items.map((i) => [i.productName, i.quantity]),
    [
      ["A4 Print Paper", 2],
      ["Greeting Card", 3],
    ],
    "the held items must be visible so the user can see what to cancel",
  );
  assert.equal(pending.paymentStatus, "CREATED");
});

test("a FAILED payment is still an unfinished checkout, never an order", async () => {
  const sql = await getSql();
  const userId = `usr_failed_${RUN}`;
  const failed = `PH-FAILED-${RUN}`;
  await sql`
    insert into orders (
      id, user_id, subtotal_paise, tax_paise, total_paise, currency,
      payment_status, order_status, customer_snapshot
    ) values (
      ${failed}, ${userId}, 400, 0, 400, 'INR', 'FAILED', 'PENDING_PAYMENT', '{}'::jsonb
    )
  `;

  assert.deepEqual(await listOrders(userId), [], "a failed payment is not an order");
  assert.equal((await pendingOrderForUser(userId))?.id, failed, "…it is an unfinished checkout");
});

test("a cancelled order belongs to neither list", async () => {
  const sql = await getSql();
  const userId = `usr_cancelled_${RUN}`;
  await sql`
    insert into orders (
      id, user_id, subtotal_paise, tax_paise, total_paise, currency,
      payment_status, order_status, customer_snapshot
    ) values (
      ${`PH-CANCEL-ONLY-${RUN}`}, ${userId}, 400, 0, 400, 'INR',
      'CANCELLED', 'CANCELLED', '{}'::jsonb
    )
  `;

  assert.deepEqual(await listOrders(userId), []);
  assert.equal(await pendingOrderForUser(userId), null);
});

test("sameCartLines matches lines and quantities, not order", () => {
  const cart = (...items) => ({ items });
  assert.equal(
    sameCartLines(cart(line("a", "A", 1), line("b", "B", 2)), cart(line("b", "B", 2), line("a", "A", 1))),
    true,
  );
  assert.equal(sameCartLines(cart(line("a", "A", 1)), cart(line("a", "A", 2))), false);
  assert.equal(sameCartLines(cart(line("a", "A", 1)), cart(line("a", "A", 1), line("b", "B", 1))), false);
  assert.equal(sameCartLines(cart(), cart()), true);
});

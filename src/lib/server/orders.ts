import { getSql, type Sql } from "@/lib/db";
import { calcTotals } from "@/lib/money";
import { parseJson } from "@/lib/utils";
import { audit } from "./audit";
import { getCart } from "./cart";
import { getProduct } from "./catalog";
import { newId, newPublicOrderId } from "./crypto-utils";
import { fail } from "./errors";
import { readIdempotent, writeIdempotent } from "./idempotency";
import { canTransitionOrder, type OrderStatus, type PaymentStatus } from "./machine";

export type OrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
};

export type OrderRecord = {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  activePaymentAttemptId: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  invoiceNumber: string | null;
  createdAt: string;
  customer: Record<string, string>;
};

type OrderRow = {
  id: string;
  user_id: string;
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  currency: string;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  active_payment_attempt_id: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  invoice_number: string | null;
  customer_snapshot: unknown;
  created_at: string;
};

async function hydrate(sql: Sql, row: OrderRow): Promise<OrderRecord> {
  const items = await sql<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_paise: number;
    subtotal_paise: number;
  }>`
    select product_id, product_name, quantity, unit_price_paise, subtotal_paise
    from order_items where order_id = ${row.id}
  `;
  return {
    id: row.id,
    userId: row.user_id,
    items: items.map((i) => ({
      productId: i.product_id,
      productName: i.product_name,
      quantity: i.quantity,
      unitPricePaise: i.unit_price_paise,
      subtotalPaise: i.subtotal_paise,
    })),
    subtotalPaise: row.subtotal_paise,
    taxPaise: row.tax_paise,
    totalPaise: row.total_paise,
    currency: row.currency,
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    activePaymentAttemptId: row.active_payment_attempt_id,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
    invoiceNumber: row.invoice_number,
    createdAt: row.created_at,
    customer: parseJson<Record<string, string>>(row.customer_snapshot, {}),
  };
}

export async function getOrderForUser(orderId: string, userId: string, admin = false) {
  const sql = await getSql();
  const rows = admin
    ? await sql<OrderRow>`
        select id, user_id, subtotal_paise, tax_paise, total_paise, currency,
               payment_status, order_status, active_payment_attempt_id,
               razorpay_order_id, razorpay_payment_id, invoice_number,
               customer_snapshot, created_at::text as created_at
        from orders where id = ${orderId} limit 1
      `
    : await sql<OrderRow>`
        select id, user_id, subtotal_paise, tax_paise, total_paise, currency,
               payment_status, order_status, active_payment_attempt_id,
               razorpay_order_id, razorpay_payment_id, invoice_number,
               customer_snapshot, created_at::text as created_at
        from orders where id = ${orderId} and user_id = ${userId} limit 1
      `;
  if (!rows[0]) return null;
  return hydrate(sql, rows[0]);
}

export async function listOrders(userId: string) {
  const sql = await getSql();
  const rows = await sql<OrderRow>`
    select id, user_id, subtotal_paise, tax_paise, total_paise, currency,
           payment_status, order_status, active_payment_attempt_id,
           razorpay_order_id, razorpay_payment_id, invoice_number,
           customer_snapshot, created_at::text as created_at
    from orders where user_id = ${userId}
    order by created_at desc
  `;
  return Promise.all(rows.map((r) => hydrate(sql, r)));
}

async function reserveStock(sql: Sql, orderId: string, productId: string, qty: number) {
  const updated = await sql<{ id: string }>`
    update products
    set stock = stock - ${qty}, updated_at = now()
    where id = ${productId} and active = true and stock >= ${qty}
    returning id
  `;
  if (!updated[0]) fail("Not enough stock for this item.", 409, "OUT_OF_STOCK");
  await sql`
    insert into stock_reservations (id, order_id, product_id, quantity)
    values (${newId("res")}, ${orderId}, ${productId}, ${qty})
  `;
}

export async function releaseStock(orderId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; product_id: string; quantity: number }>`
    select id, product_id, quantity from stock_reservations
    where order_id = ${orderId} and released = false
  `;
  for (const row of rows) {
    await sql`update products set stock = stock + ${row.quantity}, updated_at = now() where id = ${row.product_id}`;
    await sql`update stock_reservations set released = true where id = ${row.id}`;
  }
}

export async function createOrderFromCart(
  userId: string,
  idempotencyKey: string,
  customer: Record<string, string>,
) {
  const sql = await getSql();
  const existing = await readIdempotent<{ order: OrderRecord }>(
    sql,
    idempotencyKey,
    userId,
    "POST /api/orders",
    { customer },
  );
  if (existing) return existing.order;

  const pending = await sql<OrderRow>`
    select id, user_id, subtotal_paise, tax_paise, total_paise, currency,
           payment_status, order_status, active_payment_attempt_id,
           razorpay_order_id, razorpay_payment_id, invoice_number,
           customer_snapshot, created_at::text as created_at
    from orders
    where user_id = ${userId} and payment_status in ('CREATED', 'PAYMENT_INITIATED', 'PROCESSING')
       and order_status in ('PENDING_PAYMENT', 'PAYMENT_PROCESSING')
    order by created_at desc
    limit 1
  `;
  if (pending[0] && pending[0].payment_status !== "PAID") {
    // Reuse the pending order ONLY when the current cart matches its items —
    // otherwise the user would pay for a cart they can no longer see.
    const rec = await hydrate(sql, pending[0]);
    const cartNow = await getCart(userId);
    const sameCart =
      cartNow.items.length === rec.items.length &&
      [...cartNow.items]
        .sort((a, b) => a.productId.localeCompare(b.productId))
        .every(
          (line, i) =>
            line.productId === [...rec.items].sort((a, b) => a.productId.localeCompare(b.productId))[i]
              .productId && line.quantity === rec.items[i].quantity,
        );
    if (sameCart) {
      await writeIdempotent(sql, idempotencyKey, userId, "POST /api/orders", { customer }, { order: rec });
      return rec;
    }
    fail(
      "You have an unfinished payment for a different cart. Complete or cancel it first.",
      409,
      "PENDING_ORDER",
    );
  }

  const cart = await getCart(userId);
  if (cart.items.length === 0) fail("Your cart is empty.", 422);

  const priced: OrderItem[] = [];
  for (const line of cart.items) {
    const product = await getProduct(line.productId);
    if (!product || !product.active) fail(`Product ${line.name} is no longer available.`, 409);
    if (product.stock < line.quantity) fail(`Not enough stock for ${product.name}.`, 409, "OUT_OF_STOCK");
    priced.push({
      productId: product.id,
      productName: product.name,
      quantity: line.quantity,
      unitPricePaise: product.price_paise,
      subtotalPaise: product.price_paise * line.quantity,
    });
  }
  const subtotalPaise = priced.reduce((s, i) => s + i.subtotalPaise, 0);
  const totals = calcTotals(subtotalPaise);
  const orderId = newPublicOrderId();

  try {
    for (const item of priced) {
      await reserveStock(sql, orderId, item.productId, item.quantity);
    }
  } catch (err) {
    // A later line failing must not leave earlier decrements stranded.
    await releaseStock(orderId);
    throw err;
  }

  await sql`
    insert into orders (
      id, user_id, subtotal_paise, tax_paise, total_paise, currency,
      payment_status, order_status, customer_snapshot
    ) values (
      ${orderId}, ${userId}, ${totals.subtotalPaise}, ${totals.taxPaise}, ${totals.totalPaise}, 'INR',
      'CREATED', 'PENDING_PAYMENT', ${JSON.stringify(customer)}::jsonb
    )
  `;
  for (const item of priced) {
    await sql`
      insert into order_items (id, order_id, product_id, product_name, quantity, unit_price_paise, subtotal_paise)
      values (${newId("oi")}, ${orderId}, ${item.productId}, ${item.productName}, ${item.quantity}, ${item.unitPricePaise}, ${item.subtotalPaise})
    `;
  }

  await audit(sql, {
    eventType: "order_created",
    orderId,
    userId,
    status: "PENDING_PAYMENT",
    metadata: { totalPaise: totals.totalPaise },
  });

  const created = await getOrderForUser(orderId, userId);
  if (!created) fail("Could not create order.", 500);
  await writeIdempotent(sql, idempotencyKey, userId, "POST /api/orders", { customer }, { order: created });
  return created;
}

/**
 * Cancel an unpaid order and release its stock reservation. Only the owner can
 * cancel, and only while no payment is in flight (PROCESSING) or already PAID.
 */
export async function cancelOrder(userId: string, orderId: string) {
  const sql = await getSql();
  const order = await getOrderForUser(orderId, userId);
  if (!order) fail("Order not found.", 404);
  if (order.userId !== userId) fail("Forbidden.", 403);
  if (order.paymentStatus === "PAID") fail("Paid orders cannot be cancelled here.", 409);
  if (order.paymentStatus === "PROCESSING") {
    fail("Payment is being processed — wait for it to settle before cancelling.", 409);
  }
  if (!canTransitionOrder(order.orderStatus, "CANCELLED")) {
    fail("This order can no longer be cancelled.", 409);
  }
  await sql`
    update orders
    set order_status = 'CANCELLED', payment_status = 'CANCELLED', updated_at = now()
    where id = ${order.id} and payment_status <> 'PAID'
  `;
  await releaseStock(order.id);
  await audit(sql, {
    eventType: "order_cancelled",
    orderId: order.id,
    userId,
    status: "CANCELLED",
  });
  return getOrderForUser(orderId, userId);
}

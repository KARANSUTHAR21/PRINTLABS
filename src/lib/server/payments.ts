import { getSql, type Sql } from "@/lib/db";
import { audit } from "./audit";
import { newId } from "./crypto-utils";
import { fail } from "./errors";
import { readIdempotent, writeIdempotent } from "./idempotency";
import { ensureInvoice } from "./invoices";
import { withLock } from "./locks";
import {
  assertPaymentTransition,
  canTransitionPayment,
  isActivePayment,
  type PaymentStatus,
} from "./machine";
import { getOrderForUser, type OrderRecord } from "./orders";
import {
  createProviderOrder,
  isLiveRazorpay,
  publicKeyId,
  signPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "./provider";

const ATTEMPT_TTL_MS = 15 * 60 * 1000;

type AttemptRow = {
  id: string;
  order_id: string;
  user_id: string;
  attempt_number: number;
  idempotency_key: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  amount_paise: number;
  currency: string;
  status: PaymentStatus;
  provider_status: string | null;
  created_at: string;
  expires_at: string;
};

export type PaymentSession = {
  orderId: string;
  attemptId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  sandbox: boolean;
  status: PaymentStatus;
  expiresAt: string;
};

async function getAttempt(sql: Sql, id: string): Promise<AttemptRow | null> {
  const rows = await sql<AttemptRow>`
    select id, order_id, user_id, attempt_number, idempotency_key,
           razorpay_order_id, razorpay_payment_id, amount_paise, currency,
           status, provider_status, created_at::text as created_at, expires_at::text as expires_at
    from payment_attempts where id = ${id} limit 1
  `;
  return rows[0] ?? null;
}

async function getAttemptByProviderOrder(sql: Sql, razorpayOrderId: string) {
  const rows = await sql<AttemptRow>`
    select id, order_id, user_id, attempt_number, idempotency_key,
           razorpay_order_id, razorpay_payment_id, amount_paise, currency,
           status, provider_status, created_at::text as created_at, expires_at::text as expires_at
    from payment_attempts where razorpay_order_id = ${razorpayOrderId} limit 1
  `;
  return rows[0] ?? null;
}

async function setAttemptStatus(sql: Sql, id: string, from: PaymentStatus, to: PaymentStatus) {
  if (from !== to) assertPaymentTransition(from, to);
  const rows = await sql<{ id: string }>`
    update payment_attempts
    set status = ${to}, updated_at = now()
    where id = ${id} and status = ${from}
    returning id
  `;
  return Boolean(rows[0]);
}

export async function finalizePaid(input: {
  orderId: string;
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountPaise: number;
}): Promise<{ order: OrderRecord; already: boolean }> {
  const sql = await getSql();
  const order = await getOrderForUser(input.orderId, input.userId, true);
  if (!order) fail("Order not found.", 404);
  if (order.userId !== input.userId) fail("Forbidden.", 403);
  if (order.paymentStatus === "PAID" || order.orderStatus === "CONFIRMED") {
    return { order, already: true };
  }
  if (order.totalPaise !== input.amountPaise) fail("Payment amount does not match the order.", 409);

  const attempt = await getAttemptByProviderOrder(sql, input.razorpayOrderId);
  if (!attempt) fail("Payment session not found.", 404);
  if (attempt.user_id !== input.userId) fail("Forbidden.", 403);
  if (attempt.order_id !== input.orderId) fail("Payment does not belong to this order.", 409);
  if (attempt.amount_paise !== input.amountPaise) fail("Payment amount does not match the order.", 409);

  if (attempt.status !== "PAID") {
    const from = attempt.status;
    if (!canTransitionPayment(from, "PAID")) {
      fail("Payment cannot be captured in its current state.", 409);
    }
    await sql`
      update payment_attempts
      set status = 'PAID',
          razorpay_payment_id = ${input.razorpayPaymentId},
          provider_status = 'captured',
          updated_at = now()
      where id = ${attempt.id} and status <> 'PAID'
    `;
  }

  await sql`
    update orders
    set payment_status = 'PAID',
        order_status = 'CONFIRMED',
        razorpay_order_id = ${input.razorpayOrderId},
        razorpay_payment_id = ${input.razorpayPaymentId},
        updated_at = now()
    where id = ${order.id} and payment_status <> 'PAID'
  `;

  const paid = await getOrderForUser(order.id, order.userId, true);
  if (!paid) fail("Order missing after payment.", 500);
  await ensureInvoice(paid, input.razorpayPaymentId);
  await audit(sql, {
    eventType: "payment_verified",
    orderId: order.id,
    paymentId: attempt.id,
    userId: input.userId,
    status: "PAID",
    metadata: { razorpayPaymentId: input.razorpayPaymentId },
  });
  const fresh = await getOrderForUser(order.id, order.userId, true);
  return { order: fresh ?? paid, already: false };
}

export async function createPaymentSession(
  userId: string,
  orderId: string,
  idempotencyKey: string,
): Promise<PaymentSession> {
  const sql = await getSql();
  const replay = await readIdempotent<{ session: PaymentSession }>(
    sql,
    idempotencyKey,
    userId,
    "POST /api/payments/create-order",
    { orderId },
  );
  if (replay) return replay.session;

  return withLock(`payment_lock:${orderId}`, 12_000, async () => {
    const order = await getOrderForUser(orderId, userId);
    if (!order) fail("Order not found.", 404);
    if (order.userId !== userId) fail("Forbidden.", 403);
    if (order.paymentStatus === "PAID") fail("Order is already paid.", 409);

    const active = await sql<AttemptRow>`
      select id, order_id, user_id, attempt_number, idempotency_key,
             razorpay_order_id, razorpay_payment_id, amount_paise, currency,
             status, provider_status, created_at::text as created_at, expires_at::text as expires_at
      from payment_attempts
      where order_id = ${orderId} and status in ('CREATED', 'PAYMENT_INITIATED', 'PROCESSING')
      order by attempt_number desc
      limit 1
    `;
    if (active[0] && active[0].razorpay_order_id) {
      const row = active[0];
      const razorpayOrderId = row.razorpay_order_id!;
      if (new Date(row.expires_at).getTime() > Date.now()) {
        const session: PaymentSession = {
          orderId,
          attemptId: row.id,
          razorpayOrderId,
          amountPaise: row.amount_paise,
          currency: row.currency,
          keyId: publicKeyId(),
          sandbox: !isLiveRazorpay(),
          status: row.status,
          expiresAt: row.expires_at,
        };
        await writeIdempotent(
          sql,
          idempotencyKey,
          userId,
          "POST /api/payments/create-order",
          { orderId },
          { session },
        );
        return session;
      }
      await setAttemptStatus(sql, row.id, row.status, "EXPIRED");
    }

    const countRows = await sql<{ n: number }>`
      select count(*)::int as n from payment_attempts where order_id = ${orderId}
    `;
    const attemptNumber = (countRows[0]?.n ?? 0) + 1;
    const attemptId = newId("pay");
    const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString();

    await sql`
      insert into payment_attempts (
        id, order_id, user_id, attempt_number, idempotency_key, amount_paise, currency, status, expires_at
      ) values (
        ${attemptId}, ${orderId}, ${userId}, ${attemptNumber}, ${idempotencyKey},
        ${order.totalPaise}, 'INR', 'CREATED', ${expiresAt}
      )
    `;

    const provider = await createProviderOrder({
      amountPaise: order.totalPaise,
      currency: "INR",
      receipt: orderId,
    });
    if (provider.amountPaise !== order.totalPaise) {
      fail("Provider amount does not match calculated total.", 500);
    }

    try {
      await sql`
        update payment_attempts
        set razorpay_order_id = ${provider.id}, status = 'PAYMENT_INITIATED', updated_at = now()
        where id = ${attemptId}
      `;
    } catch {
      const raced = await getAttemptByProviderOrder(sql, provider.id);
      if (raced) {
        const session: PaymentSession = {
          orderId,
          attemptId: raced.id,
          razorpayOrderId: provider.id,
          amountPaise: raced.amount_paise,
          currency: raced.currency,
          keyId: publicKeyId(),
          sandbox: provider.sandbox,
          status: raced.status,
          expiresAt: raced.expires_at,
        };
        return session;
      }
      throw new Error("Could not attach provider order.");
    }

    await sql`
      update orders
      set order_status = 'PAYMENT_PROCESSING',
          payment_status = 'PAYMENT_INITIATED',
          active_payment_attempt_id = ${attemptId},
          razorpay_order_id = ${provider.id},
          updated_at = now()
      where id = ${orderId}
    `;
    await audit(sql, {
      eventType: "payment_initiated",
      orderId,
      paymentId: attemptId,
      userId,
      status: "PAYMENT_INITIATED",
      metadata: { razorpayOrderId: provider.id, sandbox: provider.sandbox },
    });

    const session: PaymentSession = {
      orderId,
      attemptId,
      razorpayOrderId: provider.id,
      amountPaise: order.totalPaise,
      currency: "INR",
      keyId: publicKeyId(),
      sandbox: provider.sandbox,
      status: "PAYMENT_INITIATED",
      expiresAt,
    };
    await writeIdempotent(
      sql,
      idempotencyKey,
      userId,
      "POST /api/payments/create-order",
      { orderId },
      { session },
    );
    return session;
  });
}

export async function markProcessing(userId: string, orderId: string) {
  const sql = await getSql();
  const order = await getOrderForUser(orderId, userId);
  if (!order?.activePaymentAttemptId) return;
  const attempt = await getAttempt(sql, order.activePaymentAttemptId);
  if (!attempt || attempt.user_id !== userId) return;
  if (canTransitionPayment(attempt.status, "PROCESSING")) {
    await setAttemptStatus(sql, attempt.id, attempt.status, "PROCESSING");
    await audit(sql, {
      eventType: "payment_processing",
      orderId,
      paymentId: attempt.id,
      userId,
      status: "PROCESSING",
    });
  }
}

export async function verifyFrontendPayment(input: {
  userId: string;
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}) {
  const sql = await getSql();
  await audit(sql, {
    eventType: "payment_verification_requested",
    orderId: input.orderId,
    userId: input.userId,
    metadata: { razorpayOrderId: input.razorpayOrderId },
  });
  if (!verifyPaymentSignature(input.razorpayOrderId, input.razorpayPaymentId, input.signature)) {
    fail("Invalid payment signature.", 400, "BAD_SIGNATURE");
  }
  const order = await getOrderForUser(input.orderId, input.userId);
  if (!order) fail("Order not found.", 404);
  if (order.razorpayOrderId && order.razorpayOrderId !== input.razorpayOrderId) {
    fail("Payment does not belong to this order.", 409);
  }
  const result = await finalizePaid({
    orderId: input.orderId,
    userId: input.userId,
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    amountPaise: order.totalPaise,
  });
  return result;
}

export async function sandboxComplete(userId: string, orderId: string, razorpayOrderId: string) {
  if (isLiveRazorpay()) fail("Sandbox capture is disabled.", 400);
  const sql = await getSql();
  const order = await getOrderForUser(orderId, userId);
  if (!order) fail("Order not found.", 404);
  const attempt = await getAttemptByProviderOrder(sql, razorpayOrderId);
  if (!attempt || attempt.user_id !== userId || attempt.order_id !== orderId) {
    fail("Payment session not found.", 404);
  }
  if (attempt.status === "PAID") {
    const paid = await getOrderForUser(orderId, userId);
    if (!paid) fail("Order not found.", 404);
    return { order: paid, already: true };
  }
  if (!isActivePayment(attempt.status) && attempt.status !== "PAYMENT_INITIATED") {
    fail("Payment cannot be captured in its current state.", 409);
  }
  const paymentId = `pay_sandbox_${newId("cap")}`;
  const signature = signPayment(razorpayOrderId, paymentId);
  await markProcessing(userId, orderId);
  return verifyFrontendPayment({
    userId,
    orderId,
    razorpayOrderId,
    razorpayPaymentId: paymentId,
    signature,
  });
}

export async function failPayment(userId: string, orderId: string, reason: string) {
  const sql = await getSql();
  const order = await getOrderForUser(orderId, userId);
  if (!order?.activePaymentAttemptId) return order;
  const attempt = await getAttempt(sql, order.activePaymentAttemptId);
  if (!attempt || attempt.status === "PAID") return order;
  if (canTransitionPayment(attempt.status, "FAILED")) {
    await setAttemptStatus(sql, attempt.id, attempt.status, "FAILED");
    await sql`
      update orders
      set payment_status = 'FAILED', order_status = 'PENDING_PAYMENT', updated_at = now()
      where id = ${orderId} and payment_status <> 'PAID'
    `;
    await audit(sql, {
      eventType: "payment_failed",
      orderId,
      paymentId: attempt.id,
      userId,
      status: "FAILED",
      metadata: { reason },
    });
  }
  return getOrderForUser(orderId, userId);
}

/**
 * A user explicitly abandoning the payment popup / cancelling the session.
 * Only marks FAILED when the attempt is still pre-PROCESSING — never races a
 * real payment that may already be verifying server-side.
 */
export async function cancelPaymentSession(userId: string, orderId: string) {
  const sql = await getSql();
  const order = await getOrderForUser(orderId, userId);
  if (!order?.activePaymentAttemptId) return order;
  const attempt = await getAttempt(sql, order.activePaymentAttemptId);
  if (!attempt || attempt.status === "PAID") return order;
  if (canTransitionPayment(attempt.status, "FAILED")) {
    await setAttemptStatus(sql, attempt.id, attempt.status, "FAILED");
    await sql`
      update orders
      set payment_status = 'FAILED', order_status = 'PENDING_PAYMENT', updated_at = now()
      where id = ${orderId} and payment_status <> 'PAID'
    `;
    await audit(sql, {
      eventType: "payment_cancelled",
      orderId,
      paymentId: attempt.id,
      userId,
      status: "FAILED",
      metadata: { reason: "user_cancelled" },
    });
  }
  return getOrderForUser(orderId, userId);
}

export async function handleWebhook(rawBody: string, signature: string | null) {
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    fail("Invalid webhook signature.", 400, "BAD_SIGNATURE");
  }
  let payload: {
    event?: string;
    payload?: { payment?: { entity?: Record<string, unknown> } };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    fail("Invalid webhook payload.", 400);
  }
  const eventId =
    (payload as { event_id?: string }).event_id ??
    `${payload.event ?? "event"}:${JSON.stringify(payload.payload ?? {}).slice(0, 80)}`;
  const sql = await getSql();
  try {
    await sql`
      insert into webhook_events (id, provider, provider_event_id, event_type, payload)
      values (${newId("wh")}, 'razorpay', ${eventId}, ${payload.event ?? "unknown"}, ${rawBody}::jsonb)
    `;
  } catch {
    return { ok: true, duplicate: true };
  }
  await audit(sql, {
    eventType: "payment_webhook_received",
    providerEventId: eventId,
    metadata: { event: payload.event },
  });

  const entity = payload.payload?.payment?.entity;
  if (!entity) return { ok: true };
  const razorpayPaymentId = String(entity.id ?? "");
  const razorpayOrderId = String(entity.order_id ?? "");
  const amount = Number(entity.amount ?? 0);
  const status = String(entity.status ?? "");
  if (!razorpayOrderId) return { ok: true };

  const attempt = await getAttemptByProviderOrder(sql, razorpayOrderId);
  if (!attempt) return { ok: true };

  if (status === "captured" || payload.event === "payment.captured") {
    await finalizePaid({
      orderId: attempt.order_id,
      userId: attempt.user_id,
      razorpayOrderId,
      razorpayPaymentId,
      amountPaise: amount || attempt.amount_paise,
    });
  } else if (status === "failed" || payload.event === "payment.failed") {
    await failPayment(attempt.user_id, attempt.order_id, "webhook_failed");
  }
  await audit(sql, {
    eventType: "payment_webhook_processed",
    orderId: attempt.order_id,
    paymentId: attempt.id,
    providerEventId: eventId,
    status,
  });
  return { ok: true };
}

export async function paymentStatus(userId: string, orderId: string, admin = false) {
  await reconcileOrder(orderId, userId, admin);
  const order = await getOrderForUser(orderId, userId, admin);
  if (!order) fail("Order not found.", 404);
  return {
    orderId: order.id,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    invoiceNumber: order.invoiceNumber,
    totalPaise: order.totalPaise,
  };
}

export async function reconcileOrder(orderId: string, requesterId?: string, admin = false) {
  const sql = await getSql();
  const rows = await sql<AttemptRow>`
    select id, order_id, user_id, attempt_number, idempotency_key,
           razorpay_order_id, razorpay_payment_id, amount_paise, currency,
           status, provider_status, created_at::text as created_at, expires_at::text as expires_at
    from payment_attempts
    where order_id = ${orderId} and status in ('CREATED', 'PAYMENT_INITIATED', 'PROCESSING')
  `;
  for (const row of rows) {
    if (requesterId !== undefined && row.user_id !== requesterId && !admin) continue;
    if (new Date(row.expires_at).getTime() > Date.now()) continue;
    if (row.status === "PAID") continue;
    if (canTransitionPayment(row.status, "EXPIRED")) {
      await setAttemptStatus(sql, row.id, row.status, "EXPIRED");
      await sql`
        update orders
        set payment_status = 'EXPIRED', order_status = 'PENDING_PAYMENT', updated_at = now()
        where id = ${row.order_id} and payment_status <> 'PAID'
      `;
      await audit(sql, {
        eventType: "payment_expired",
        orderId: row.order_id,
        paymentId: row.id,
        userId: row.user_id,
        status: "EXPIRED",
      });
    }
  }
}

/**
 * Reconciliation sweep for stale payment attempts (spec §31/§32). Called by the
 * payment-status pollers on any order being viewed; safe to run concurrently
 * (transition guards make expiry idempotent). Returns the number of attempts
 * expired this pass.
 */
export async function reconcileStaleAttempts(limit = 100) {
  const sql = await getSql();
  const rows = await sql<{ order_id: string }>`
    select distinct order_id from payment_attempts
    where status in ('CREATED', 'PAYMENT_INITIATED', 'PROCESSING')
      and expires_at < now()
    limit ${limit}
  `;
  let expired = 0;
  for (const row of rows) {
    await reconcileOrder(row.order_id);
    expired += 1;
  }
  return { swept: rows.length, expired };
}

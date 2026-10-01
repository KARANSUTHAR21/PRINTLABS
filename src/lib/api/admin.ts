import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { audit } from "@/lib/server/audit";
import { invalidateCatalog, type ProductRow, type ServiceRow } from "@/lib/server/catalog";
import { getSql } from "@/lib/db";
import { asResult, fail, ok, type ApiResult } from "@/lib/server/errors";
import { canTransitionOrder, ORDER_TRANSITIONS } from "@/lib/server/machine";
import { getOrderForUser, type OrderRecord } from "@/lib/server/orders";
import { isAdmin } from "@/lib/server/profile";

/**
 * Admin API surface (spec Phases 5–6). Every function:
 *  1. authenticates via `authMiddleware` (verified `context.userId`), then
 *  2. re-checks the DB role (`isAdmin`) — client state is never trusted.
 * A non-admin gets `403` on every surface here. Order transitions go through
 * the same `ORDER_TRANSITIONS` guards the payment pipeline uses, so the
 * lifecycle machine cannot be violated from the admin side either.
 */

async function requireAdmin(userId: string) {
  if (!(await isAdmin(userId))) fail("Admin access required.", 403, "FORBIDDEN");
}

// ── Reads ────────────────────────────────────────────────────────────────────

export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ApiResult<{ products: ProductRow[] }>> => {
    try {
      await requireAdmin(context.userId);
      const sql = await getSql();
      const products = await sql<ProductRow>`
        select id, name, slug, description, category, price_paise, image, stock, active,
               manage_notes, created_at::text as created_at, updated_at::text as updated_at
        from products order by created_at desc
      `;
      return ok({ products });
    } catch (err) {
      return asResult(err);
    }
  });

export const adminListServices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ApiResult<{ services: ServiceRow[] }>> => {
    try {
      await requireAdmin(context.userId);
      const sql = await getSql();
      const services = await sql<ServiceRow>`
        select id, slug, title, subtitle, description, image, icon, sort_order, active, manage_notes
        from services order by sort_order asc
      `;
      return ok({ services });
    } catch (err) {
      return asResult(err);
    }
  });

export const adminListOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    (data: unknown) =>
      z
        .object({
          status: z.string().optional(),
          limit: z.number().int().min(1).max(500).optional(),
        })
        .parse(data ?? {}),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ orders: OrderRecord[] }>> => {
    try {
      await requireAdmin(context.userId);
      const sql = await getSql();
      const rows = await sql<{
        id: string;
        user_id: string;
        subtotal_paise: number;
        tax_paise: number;
        total_paise: number;
        currency: string;
        payment_status: OrderRecord["paymentStatus"];
        order_status: OrderRecord["orderStatus"];
        active_payment_attempt_id: string | null;
        razorpay_order_id: string | null;
        razorpay_payment_id: string | null;
        invoice_number: string | null;
        customer_snapshot: unknown;
        created_at: string;
      }>`
        select id, user_id, subtotal_paise, tax_paise, total_paise, currency,
               payment_status, order_status, active_payment_attempt_id,
               razorpay_order_id, razorpay_payment_id, invoice_number,
               customer_snapshot, created_at::text as created_at
        from orders
        where ${data.status ?? ""} = '' or order_status = ${data.status ?? ""}
        order by created_at desc
        limit ${data.limit ?? 200}
      `;
      // Hydrate items with the shared helper by re-reading per order (orders
      // tables are small; per-item queries stay within one pool round-trip).
      const orders: OrderRecord[] = [];
      for (const row of rows) {
        const rec = await getOrderForUser(row.id, row.user_id, true);
        if (rec) orders.push(rec);
      }
      return ok({ orders });
    } catch (err) {
      return asResult(err);
    }
  });

export const adminAuditLog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((data: unknown) => z.object({ orderId: z.string().optional() }).parse(data ?? {}))
  .handler(
    async ({
      context,
      data,
    }): Promise<
      ApiResult<{
        events: Array<{
          eventType: string;
          orderId: string | null;
          paymentId: string | null;
          userId: string | null;
          status: string | null;
          providerEventId: string | null;
          metadata: string;
          createdAt: string;
        }>;
      }>
    > => {
      type AuditRow = {
        event_type: string;
        order_id: string | null;
        payment_id: string | null;
        user_id: string | null;
        status: string | null;
        provider_event_id: string | null;
        metadata: unknown;
        created_at: string;
      };
      try {
        await requireAdmin(context.userId);
        const sql = await getSql();
        const rows = data.orderId
          ? await sql<AuditRow>`select event_type, order_id, payment_id, user_id, status, provider_event_id, metadata, created_at::text as created_at
                    from audit_logs where order_id = ${data.orderId} order by created_at asc limit 200`
          : await sql<AuditRow>`select event_type, order_id, payment_id, user_id, status, provider_event_id, metadata, created_at::text as created_at
                    from audit_logs order by created_at desc limit 200`;
        const events = rows.map((r) => ({
          eventType: r.event_type,
          orderId: r.order_id,
          paymentId: r.payment_id,
          userId: r.user_id,
          status: r.status,
          providerEventId: r.provider_event_id,
          metadata: typeof r.metadata === "string" ? r.metadata : JSON.stringify(r.metadata ?? {}),
          createdAt: r.created_at,
        }));
        return ok({ events });
      } catch (err) {
        return asResult(err);
      }
    },
  );

// ── Product mutations ────────────────────────────────────────────────────────

const productPatch = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(80).optional(),
  pricePaise: z.number().int().min(0).max(100_000_00).optional(),
  image: z.string().max(500).optional(),
  stock: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const adminUpsertProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => productPatch.parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ product: ProductRow }>> => {
    try {
      await requireAdmin(context.userId);
      const sql = await getSql();
      const { id, ...patch } = data;
      if (patch.pricePaise !== undefined || patch.stock !== undefined) {
        // Re-activating with zero stock would let customers order nothing.
        const cur = await sql<{ stock: number }>`select stock from products where id = ${id} limit 1`;
        if (!cur[0]) fail("Product not found.", 404);
      }
      const updated = await sql<ProductRow>`
        update products set
          name = coalesce(${patch.name ?? null}, name),
          description = coalesce(${patch.description ?? null}, description),
          category = coalesce(${patch.category ?? null}, category),
          price_paise = coalesce(${patch.pricePaise ?? null}, price_paise),
          image = coalesce(${patch.image ?? null}, image),
          stock = coalesce(${patch.stock ?? null}, stock),
          active = coalesce(${patch.active ?? null}, active),
          updated_at = now()
        where id = ${id}
        returning id, name, slug, description, category, price_paise, image, stock, active,
                  manage_notes, created_at::text as created_at, updated_at::text as updated_at
      `;
      if (!updated[0]) fail("Product not found.", 404);
      await invalidateCatalog();
      await audit(sql, {
        eventType: "admin_product_updated",
        userId: context.userId,
        metadata: { productId: id, patch: JSON.parse(JSON.stringify(patch)) },
      });
      return ok({ product: updated[0] });
    } catch (err) {
      return asResult(err);
    }
  });

export const adminCreateProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: unknown) =>
      z
        .object({
          name: z.string().min(1).max(160),
          description: z.string().max(2000),
          category: z.string().min(1).max(80),
          pricePaise: z.number().int().min(0).max(100_000_00),
          image: z.string().max(500),
          stock: z.number().int().min(0),
          slug: z.string().min(1).max(120).optional(),
        })
        .parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ product: ProductRow }>> => {
    try {
      await requireAdmin(context.userId);
      const sql = await getSql();
      const slug =
        data.slug?.trim() ||
        data.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 100) ||
        `product-${Date.now()}`;
      const id = `prd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const rows = await sql<ProductRow>`
        insert into products (id, name, slug, description, category, price_paise, image, stock)
        values (${id}, ${data.name}, ${slug}, ${data.description}, ${data.category}, ${data.pricePaise}, ${data.image}, ${data.stock})
        returning id, name, slug, description, category, price_paise, image, stock, active,
                  manage_notes, created_at::text as created_at, updated_at::text as updated_at
      `;
      await invalidateCatalog();
      await audit(sql, {
        eventType: "admin_product_created",
        userId: context.userId,
        metadata: { productId: id, slug },
      });
      return ok({ product: rows[0] });
    } catch (err) {
      return asResult(err);
    }
  });

// ── Service mutations ────────────────────────────────────────────────────────

const servicePatch = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160).optional(),
  subtitle: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const adminUpsertService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) => servicePatch.parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ service: ServiceRow }>> => {
    try {
      await requireAdmin(context.userId);
      const sql = await getSql();
      const { id, ...patch } = data;
      const rows = await sql<ServiceRow>`
        update services set
          title = coalesce(${patch.title ?? null}, title),
          subtitle = coalesce(${patch.subtitle ?? null}, subtitle),
          description = coalesce(${patch.description ?? null}, description),
          sort_order = coalesce(${patch.sortOrder ?? null}, sort_order),
          active = coalesce(${patch.active ?? null}, active),
          updated_at = now()
        where id = ${id}
        returning id, slug, title, subtitle, description, image, icon, sort_order, active, manage_notes
      `;
      if (!rows[0]) fail("Service not found.", 404);
      await invalidateCatalog();
      await audit(sql, {
        eventType: "admin_service_updated",
        userId: context.userId,
        metadata: { serviceId: id },
      });
      return ok({ service: rows[0] });
    } catch (err) {
      return asResult(err);
    }
  });

// ── Order fulfillment lifecycle (Phase 6) ────────────────────────────────────

const ALLOWED_TARGETS = new Set(Object.values(ORDER_TRANSITIONS).flat());

export const adminSetOrderStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: unknown) =>
      z
        .object({
          orderId: z.string().min(1),
          status: z.enum(["CONFIRMED", "PROCESSING", "READY", "COMPLETED", "CANCELLED"]),
          reason: z.string().max(300).optional(),
        })
        .parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ order: OrderRecord }>> => {
    try {
      await requireAdmin(context.userId);
      const sql = await getSql();
      const order = await getOrderForUser(data.orderId, context.userId, true);
      if (!order) fail("Order not found.", 404);
      if (!ALLOWED_TARGETS.has(data.status)) fail("Unknown order status.", 422);
      if (!canTransitionOrder(order.orderStatus, data.status)) {
        fail(
          `Illegal transition ${order.orderStatus} → ${data.status}. Allowed: ${ORDER_TRANSITIONS[order.orderStatus].join(", ") || "none"}.`,
          409,
          "ILLEGAL_TRANSITION",
        );
      }
      // Paid orders keep their payment state; fulfilment only moves order_status.
      await sql`
        update orders set
          order_status = ${data.status},
          fulfilled_at = ${data.status === "COMPLETED" ? new Date().toISOString() : null}::timestamptz,
          fulfilled_by = ${data.status === "COMPLETED" ? context.userId : null},
          cancelled_reason = ${data.status === "CANCELLED" ? (data.reason ?? "admin_cancelled") : null},
          updated_at = now()
        where id = ${order.id}
      `;
      // Cancelling an unpaid order releases the stock reservation (same rules
      // as the customer path; the payment state machine guards paid orders).
      if (data.status === "CANCELLED" && order.paymentStatus !== "PAID") {
        const { releaseStock } = await import("@/lib/server/orders");
        await releaseStock(order.id);
        await sql`
          update orders set payment_status = 'CANCELLED'
          where id = ${order.id} and payment_status not in ('PAID', 'REFUNDED')
        `;
      }
      await audit(sql, {
        eventType: "admin_order_status",
        orderId: order.id,
        userId: context.userId,
        status: data.status,
        metadata: { from: order.orderStatus, reason: data.reason ?? null },
      });
      const fresh = await getOrderForUser(order.id, context.userId, true);
      if (!fresh) fail("Order missing after update.", 500);
      // Customer status email (Phase 7) — fire-and-forget, never blocks admin.
      const { sendOrderStatusMail } = await import("@/lib/server/email");
      const email = order.customer.email;
      if (email) void sendOrderStatusMail({ to: email, orderId: order.id, status: data.status });
      return ok({ order: fresh });
    } catch (err) {
      return asResult(err);
    }
  });

/** Promote/demote a user's profile role (admin bootstrap + team management). */
export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (data: unknown) =>
      z
        .object({ userId: z.string().min(1), role: z.enum(["USER", "ADMIN"]) })
        .parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ ok: true }>> => {
    try {
      await requireAdmin(context.userId);
      const sql = await getSql();
      await sql`
        insert into user_profiles (user_id, role) values (${data.userId}, ${data.role})
        on conflict (user_id) do update set role = ${data.role}, updated_at = now()
      `;
      await audit(sql, {
        eventType: "admin_user_role",
        userId: context.userId,
        metadata: { targetUser: data.userId, role: data.role },
      });
      return ok({ ok: true });
    } catch (err) {
      return asResult(err);
    }
  });

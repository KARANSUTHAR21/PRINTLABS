import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware, requireRoleMiddleware } from "@/lib/auth/middleware";
import {
  addCartItem,
  clearCart,
  getCart,
  mergeGuestCart,
  removeCartItem,
  setCartItem,
  type CartView,
} from "@/lib/server/cart";
import { asResult, fail, ok, type ApiResult } from "@/lib/server/errors";
import { getInvoiceForOrder, type InvoiceRecord } from "@/lib/server/invoices";
import {
  cancelOrder,
  createOrderFromCart,
  getOrderForUser,
  listOrders,
  pendingOrderForUser,
  sameCartLines,
  type OrderRecord,
} from "@/lib/server/orders";
import {
  createPaymentSession,
  markProcessing,
  type PaymentSession,
  paymentStatus,
  sandboxComplete,
  verifyFrontendPayment,
} from "@/lib/server/payments";
import { ensureProfile, isAdmin, updateProfile, type Profile } from "@/lib/server/profile";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";

const qtySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(9999),
});

export const loadCart = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("USER")])
  .handler(async ({ context }): Promise<ApiResult<{ cart: CartView }>> => {
    try {
      const cart = await getCart(context.userId);
      return ok({ cart });
    } catch (err) {
      return asResult(err);
    }
  });

export const addToCart = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) => qtySchema.parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ cart: CartView }>> => {
    try {
      const cart = await addCartItem(context.userId, data.productId, data.quantity);
      return ok({ cart });
    } catch (err) {
      return asResult(err);
    }
  });

export const updateCartItem = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) =>
    z.object({ productId: z.string(), quantity: z.number().int().min(0).max(9999) }).parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ cart: CartView }>> => {
    try {
      const cart = await setCartItem(context.userId, data.productId, data.quantity);
      return ok({ cart });
    } catch (err) {
      return asResult(err);
    }
  });

export const deleteCartItem = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) => z.object({ productId: z.string() }).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ cart: CartView }>> => {
    try {
      const cart = await removeCartItem(context.userId, data.productId);
      return ok({ cart });
    } catch (err) {
      return asResult(err);
    }
  });

export const emptyCart = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .handler(async ({ context }): Promise<ApiResult<{ cart: CartView }>> => {
    try {
      const cart = await clearCart(context.userId);
      return ok({ cart });
    } catch (err) {
      return asResult(err);
    }
  });

export const mergeCart = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) =>
    z
      .object({
        items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ cart: CartView }>> => {
    try {
      const cart = await mergeGuestCart(context.userId, data.items);
      return ok({ cart });
    } catch (err) {
      return asResult(err);
    }
  });

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) =>
    z
      .object({
        idempotencyKey: z.string().min(8),
        customer: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          // Delivery address is compulsory for payment (spec request).
          addressLine: z.string().trim().min(1, "Address is required."),
          city: z.string().trim().min(1, "City is required."),
          pincode: z.string().trim().min(1, "PIN code is required."),
        }),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ order: OrderRecord }>> => {
    try {
      if (!(await rateLimit(clientKey(context.userId, "order"), 8, 60_000))) {
        fail("Too many order attempts. Please wait.", 429);
      }
      const order = await createOrderFromCart(context.userId, data.idempotencyKey, data.customer);
      return ok({ order });
    } catch (err) {
      return asResult(err);
    }
  });

export const loadOrders = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("USER")])
  .handler(async ({ context }): Promise<ApiResult<{ orders: OrderRecord[] }>> => {
    try {
      const orders = await listOrders(context.userId);
      return ok({ orders });
    } catch (err) {
      return asResult(err);
    }
  });

/**
 * The user's UNFINISHED checkout — an unpaid, non-cancelled order returned
 * with its items. The cart page uses it to show exactly what is being held
 * and to offer completing or cancelling it (spec request).
 */
export const loadPendingOrder = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("USER")])
  .handler(
    async ({
      context,
    }): Promise<ApiResult<{ order: OrderRecord | null; matchesCart: boolean }>> => {
      try {
        const order = await pendingOrderForUser(context.userId);
        // Whether the unfinished checkout still IS the current cart — decided
        // on the server (one definition of "same cart", shared with
        // `createOrderFromCart`) so the checkout never has to guess.
        const matchesCart = order ? sameCartLines(await getCart(context.userId), order) : false;
        return ok({ order, matchesCart });
      } catch (err) {
        return asResult(err);
      }
    },
  );

export const loadOrder = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("USER", "ADMIN", "DELIVERY_PARTNER")])
  .validator((id: unknown) => z.string().min(1).parse(id))
  .handler(async ({ context, data }): Promise<ApiResult<{ order: OrderRecord }>> => {
    try {
      const admin = await isAdmin(context.userId);
      const order = await getOrderForUser(data, context.userId, admin);
      if (!order) return { success: false as const, message: "Order not found.", status: 404 };
      return ok({ order });
    } catch (err) {
      return asResult(err);
    }
  });

export const startPayment = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) =>
    z.object({ orderId: z.string().min(1), idempotencyKey: z.string().min(8) }).parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ session: PaymentSession }>> => {
    try {
      if (!(await rateLimit(clientKey(context.userId, "pay"), 10, 60_000))) {
        fail("Too many payment attempts. Please wait.", 429);
      }
      const session = await createPaymentSession(context.userId, data.orderId, data.idempotencyKey);
      return ok({ session });
    } catch (err) {
      return asResult(err);
    }
  });

export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string(),
        razorpayOrderId: z.string(),
        razorpayPaymentId: z.string(),
        signature: z.string(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ order: OrderRecord; already: boolean }>> => {
    try {
      if (!(await rateLimit(clientKey(context.userId, "verify"), 20, 60_000))) {
        fail("Too many verification attempts.", 429);
      }
      const result = await verifyFrontendPayment({ ...data, userId: context.userId });
      return ok(result);
    } catch (err) {
      return asResult(err);
    }
  });

export const completeSandboxPayment = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) =>
    z.object({ orderId: z.string(), razorpayOrderId: z.string() }).parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ order: OrderRecord; already: boolean }>> => {
    try {
      const result = await sandboxComplete(context.userId, data.orderId, data.razorpayOrderId);
      return ok(result);
    } catch (err) {
      return asResult(err);
    }
  });

export const markPaymentOpen = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) => z.object({ orderId: z.string() }).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ ok: true }>> => {
    try {
      await markProcessing(context.userId, data.orderId);
      return ok({ ok: true });
    } catch (err) {
      return asResult(err);
    }
  });

export const cancelPendingOrder = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) => z.object({ orderId: z.string().min(1) }).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ order: OrderRecord | null }>> => {
    try {
      const order = await cancelOrder(context.userId, data.orderId);
      return ok({ order });
    } catch (err) {
      return asResult(err);
    }
  });

export const loadPaymentStatus = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((orderId: unknown) => z.string().min(1).parse(orderId))
  .handler(async ({ context, data }): Promise<ApiResult<{ status: Awaited<ReturnType<typeof paymentStatus>> }>> => {
    try {
      const status = await paymentStatus(context.userId, data);
      return ok({ status });
    } catch (err) {
      return asResult(err);
    }
  });

export const loadInvoice = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("USER", "ADMIN")])
  .validator((orderId: unknown) => z.string().min(1).parse(orderId))
  .handler(async ({ context, data }): Promise<ApiResult<{ invoice: InvoiceRecord }>> => {
    try {
      const admin = await isAdmin(context.userId);
      const invoice = await getInvoiceForOrder(data, context.userId, admin);
      if (!invoice) return { success: false as const, message: "Invoice not found.", status: 404 };
      return ok({ invoice });
    } catch (err) {
      return asResult(err);
    }
  });

export const loadProfile = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER")])
  .handler(async ({ context }): Promise<ApiResult<{ profile: Profile }>> => {
    try {
      const profile = await ensureProfile(context.userId);
      return ok({ profile });
    } catch (err) {
      return asResult(err);
    }
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER")])
  .validator((data: unknown) =>
    z
      .object({
        firstName: z.string().max(80).optional(),
        lastName: z.string().max(80).optional(),
        phone: z.string().max(30).optional(),
        addressLine: z.string().max(160).optional(),
        city: z.string().max(80).optional(),
        pincode: z.string().max(12).optional(),
        // Avatar as a downscaled data URL (the client resizes to ≤256px JPEG
        // before upload so this stays far below any request limits).
        photoUrl: z
          .string()
          .max(200_000)
          .regex(/^data:image\/(png|jpeg);base64,/, "Unsupported image format.")
          .nullable()
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ profile: Profile }>> => {
    try {
      const profile = await updateProfile(context.userId, data);
      return ok({ profile });
    } catch (err) {
      return asResult(err);
    }
  });

export const saveSignupProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: unknown) =>
    z.object({ firstName: z.string().min(1), lastName: z.string().min(1) }).parse(data),
  )
  .handler(async ({ context, data }): Promise<ApiResult<{ profile: Profile }>> => {
    try {
      const profile = await ensureProfile(context.userId, data);
      if (!profile.firstName) {
        const updated = await updateProfile(context.userId, data);
        return ok({ profile: updated });
      }
      return ok({ profile });
    } catch (err) {
      return asResult(err);
    }
  });

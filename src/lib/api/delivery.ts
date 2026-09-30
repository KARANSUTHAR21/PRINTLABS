import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRoleMiddleware } from "@/lib/auth/middleware";
import { asResult, ok, type ApiResult } from "@/lib/server/errors";
import {
  assignDeliveryRequest,
  createDeliveryRequest,
  rejectDeliveryRequest,
  getAssignedDeliveryOrder,
  listDeliveryRequests,
  listMyDeliveryAssignments,
  updateMyDeliveryStatus,
  type DeliveryAssignment,
} from "@/lib/server/delivery";
import type { OrderRecord } from "@/lib/server/orders";

export const loadMyDeliveryAssignments = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .handler(async ({ context }): Promise<ApiResult<{ assignments: DeliveryAssignment[] }>> => {
    try { return ok({ assignments: await listMyDeliveryAssignments(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const loadAssignedDeliveryOrder = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .validator((data: unknown) => z.object({ orderId: z.string().min(1) }).strict().parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ assignment: DeliveryAssignment; order: OrderRecord }>> => {
    try { return ok(await getAssignedDeliveryOrder(context.userId, data.orderId)); }
    catch (err) { return asResult(err); }
  });

export const requestDeliveryAssignment = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .validator((data: unknown) => z.object({ orderId: z.string().min(1) }).strict().parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ requested: true }>> => {
    try {
      return ok(await createDeliveryRequest(context.userId, data.orderId));
    } catch (err) { return asResult(err); }
  });

export const loadDeliveryRequests = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .handler(async ({ context }): Promise<ApiResult<{ requests: Awaited<ReturnType<typeof listDeliveryRequests>> }>> => {
    try { return ok({ requests: await listDeliveryRequests(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const rejectDeliveryRequestFn = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .validator((data: unknown) => z.object({ requestId: z.string().min(1), reason: z.string().max(300).optional() }).strict().parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ rejected: true }>> => {
    try { return ok(await rejectDeliveryRequest(context.userId, data.requestId, data.reason)); }
    catch (err) { return asResult(err); }
  });

export const assignDeliveryRequestFn = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .validator((data: unknown) => z.object({ requestId: z.string().min(1), partnerId: z.string().min(1) }).strict().parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ assignment: Awaited<ReturnType<typeof assignDeliveryRequest>> }>> => {
    try { return ok({ assignment: await assignDeliveryRequest(context.userId, data.requestId, data.partnerId) }); }
    catch (err) { return asResult(err); }
  });

export const updateAssignedDeliveryStatus = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .validator((data: unknown) => z.object({ orderId: z.string().min(1), status: z.enum(["PICKED_UP", "DELIVERED"]) }).strict().parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ assignment: DeliveryAssignment }>> => {
    try { return ok({ assignment: await updateMyDeliveryStatus(context.userId, data.orderId, data.status) }); }
    catch (err) { return asResult(err); }
  });

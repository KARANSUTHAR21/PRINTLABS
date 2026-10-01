import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireCustomerMiddleware, requireRoleMiddleware } from "@/lib/auth/middleware";
import { asResult, ok, type ApiResult } from "@/lib/server/errors";
import {
  assignDeliveryRequest,
  createDeliveryRequest,
  getAssignedDeliveryOrder,
  getMyDeliveryEarningsSummary,
  getMyDeliveryPreferences,
  listAdminDeliveryPartners,
  listDeliveryRequests,
  listMyDeliveryAssignments,
  listMyDeliveryHistory,
  listMyDeliveryNotifications,
  markMyDeliveryNotificationRead,
  rejectDeliveryRequest,
  setMyDeliveryAvailability,
  updateMyDeliveryStatus,
  type DeliveryAssignment,
  type DeliveryPreferences,
} from "@/lib/server/delivery";
import type { AdminRefundCase } from "@/lib/server/refunds";
import { createAdminRefundCase, listAdminRefundCases, updateAdminRefundCase } from "@/lib/server/refunds";
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

export const loadMyDeliveryPreferences = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .handler(async ({ context }): Promise<ApiResult<{ preferences: DeliveryPreferences }>> => {
    try { return ok({ preferences: await getMyDeliveryPreferences(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const saveMyDeliveryAvailability = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .validator((data: unknown) => z.object({ available: z.boolean() }).strict().parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ preferences: DeliveryPreferences }>> => {
    try { return ok({ preferences: await setMyDeliveryAvailability(context.userId, data.available) }); }
    catch (err) { return asResult(err); }
  });

export const loadMyDeliveryHistory = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .handler(async ({ context }): Promise<ApiResult<{ assignments: DeliveryAssignment[] }>> => {
    try { return ok({ assignments: await listMyDeliveryHistory(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const loadMyDeliveryEarnings = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .handler(async ({ context }): Promise<ApiResult<{ earnings: Awaited<ReturnType<typeof getMyDeliveryEarningsSummary>> }>> => {
    try { return ok({ earnings: await getMyDeliveryEarningsSummary(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const loadMyDeliveryNotifications = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .handler(async ({ context }): Promise<ApiResult<{ notifications: Awaited<ReturnType<typeof listMyDeliveryNotifications>> }>> => {
    try { return ok({ notifications: await listMyDeliveryNotifications(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const markMyDeliveryNotificationReadFn = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("DELIVERY_PARTNER")])
  .validator((data: unknown) => z.object({ notificationId: z.string().min(1) }).strict().parse(data))
  .handler(async ({ context, data }) => {
    try { return ok(await markMyDeliveryNotificationRead(context.userId, data.notificationId)); }
    catch (err) { return asResult(err); }
  });

export const loadAdminDeliveryPartners = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .handler(async ({ context }): Promise<ApiResult<{ partners: Awaited<ReturnType<typeof listAdminDeliveryPartners>> }>> => {
    try { return ok({ partners: await listAdminDeliveryPartners(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const loadAdminRefundCases = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .handler(async ({ context }): Promise<ApiResult<{ refundCases: AdminRefundCase[] }>> => {
    try { return ok({ refundCases: await listAdminRefundCases(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const createAdminRefundCaseFn = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .validator((data: unknown) => z.object({ orderId: z.string().min(1), reason: z.string().trim().min(5).max(500) }).strict().parse(data))
  .handler(async ({ context, data }) => {
    try { return ok(await createAdminRefundCase(context.userId, data.orderId, data.reason)); }
    catch (err) { return asResult(err); }
  });

export const updateAdminRefundCaseFn = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .validator((data: unknown) => z.object({ caseId: z.string().min(1), status: z.enum(["UNDER_REVIEW", "APPROVED", "DECLINED", "EXTERNAL_REFUND_RECORDED"]), providerReference: z.string().trim().min(1).max(160).optional() }).strict().refine((data) => data.status !== "EXTERNAL_REFUND_RECORDED" || Boolean(data.providerReference)).parse(data))
  .handler(async ({ context, data }) => {
    try { return ok(await updateAdminRefundCase(context.userId, data.caseId, data.status, data.providerReference)); }
    catch (err) { return asResult(err); }
  });

export const requestDeliveryAssignment = createServerFn({ method: "POST" })
  .middleware([requireCustomerMiddleware])
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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRoleMiddleware, requireVendorApplicantMiddleware } from "@/lib/auth/middleware";
import { asResult, ok, type ApiResult } from "@/lib/server/errors";
import {
  addVendorProduct,
  getVendorAccess,
  getVendorDashboard,
  getVendorShop,
  type JsonRecord,
  listVendorApplications,
  listVendorShopsForAdmin,
  setVendorShopAdmin,
  type AdminVendorShopRecord,
  type VendorApplicationRecord,
  listVendorInventory,
  listVendorNotifications,
  listVendorStockHistory,
  reviewVendorApplication,
  submitVendorApplication,
  updateVendorListing,
  updateVendorShop,
  updateVendorStock,
} from "@/lib/server/vendor";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const openingHoursValue = z.string()
  .regex(/^(Closed|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)$/)
  .refine((value) => value === "Closed" || value.slice(0, 5) < value.slice(6), "Closing time must be later than opening time.");

const applicationSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  contactPhone: z.string().trim().min(7).max(30),
  category: z.string().trim().min(2).max(80),
  addressLine: z.string().trim().min(4).max(240),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().min(4).max(12),
});

export const loadVendorAccess = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER")])
  .handler(async ({ context }): Promise<ApiResult<{ access: Awaited<ReturnType<typeof getVendorAccess>> }>> => {
    try { return ok({ access: await getVendorAccess(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const applyForVendor = createServerFn({ method: "POST" })
  .middleware([requireVendorApplicantMiddleware])
  .validator((data: unknown) => applicationSchema.parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ status: "PENDING" }>> => {
    try { return ok(await submitVendorApplication(context.userId, data)); }
    catch (err) { return asResult(err); }
  });

export const loadVendorApplications = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .handler(async ({ context }): Promise<ApiResult<{ applications: VendorApplicationRecord[] }>> => {
    try { return ok({ applications: await listVendorApplications(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const loadVendorShopsForAdminFn = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .handler(async ({ context }): Promise<ApiResult<{ shops: AdminVendorShopRecord[] }>> => {
    try { return ok({ shops: await listVendorShopsForAdmin(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const setVendorShopAdminFn = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .validator((data: unknown) => z.object({
    shopId: z.string().min(1), verified: z.boolean().optional(), active: z.boolean().optional(),
  }).strict().refine(({ verified, active }) => verified !== undefined || active !== undefined).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ shop: Awaited<ReturnType<typeof setVendorShopAdmin>> }>> => {
    try { return ok({ shop: await setVendorShopAdmin(context.userId, data.shopId, data) }); }
    catch (err) { return asResult(err); }
  });

export const decideVendorApplication = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("ADMIN")])
  .validator((data: unknown) => z.object({
    applicationId: z.string().min(1), decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().max(500).optional(),
  }).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ status: string }>> => {
    try { return ok(await reviewVendorApplication(context.userId, data.applicationId, data.decision, data.note)); }
    catch (err) { return asResult(err); }
  });

export const loadVendorDashboardFn = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .handler(async ({ context }): Promise<ApiResult<{ dashboard: Awaited<ReturnType<typeof getVendorDashboard>> }>> => {
    try { return ok({ dashboard: await getVendorDashboard(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const loadVendorShop = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .handler(async ({ context }): Promise<ApiResult<{ shop: JsonRecord }>> => {
    try { return ok({ shop: await getVendorShop(context.userId) }); }
    catch (err) { return asResult(err); }
  });

export const saveVendorShop = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .validator((data: unknown) => z.object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().max(2000).optional(),
    phone: z.string().max(30).optional(), email: z.string().email().max(254).nullable().optional(),
    category: z.string().max(100).optional(), addressLine: z.string().max(240).optional(),
    city: z.string().max(100).optional(), state: z.string().max(100).optional(),
    pincode: z.string().max(12).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    images: z.array(z.string().url().max(1000)).max(5).optional(),
    coverImage: z.string().url().max(1000).nullable().optional(),
    openingHours: z.record(z.enum(WEEKDAYS), openingHoursValue)
      .refine((hours) => WEEKDAYS.every((day) => day in hours), "Provide hours for every day of the week.")
      .optional(),
    isOpen: z.boolean().optional(),
  }).strict().refine((data) => Object.keys(data).length > 0).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ shop: JsonRecord }>> => {
    try { return ok({ shop: await updateVendorShop(context.userId, data) }); }
    catch (err) { return asResult(err); }
  });

export const loadVendorInventory = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .validator((data: unknown) => z.object({ lowStock: z.boolean().optional() }).parse(data ?? {}))
  .handler(async ({ context, data }): Promise<ApiResult<{ products: Awaited<ReturnType<typeof listVendorInventory>> }>> => {
    try { return ok({ products: await listVendorInventory(context.userId, data) }); }
    catch (err) { return asResult(err); }
  });

export const addVendorProductFn = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .validator((data: unknown) => z.object({
    productId: z.string().min(1), sellingPricePaise: z.number().int().min(0).max(100_000_00),
    quantity: z.number().int().min(0).max(1_000_000), minimumStock: z.number().int().min(0).max(1_000_000),
  }).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ product: Awaited<ReturnType<typeof addVendorProduct>> }>> => {
    try { return ok({ product: await addVendorProduct(context.userId, data) }); }
    catch (err) { return asResult(err); }
  });

export const changeVendorStock = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .validator((data: unknown) => z.object({
    listingId: z.string().min(1), quantityChange: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0), note: z.string().max(300).optional(),
  }).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ stock: { id: string; available_quantity: number } }>> => {
    try { return ok({ stock: await updateVendorStock(context.userId, data) }); }
    catch (err) { return asResult(err); }
  });

export const editVendorListing = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .validator((data: unknown) => z.object({
    listingId: z.string().min(1), sellingPricePaise: z.number().int().min(0).max(100_000_00).optional(),
    minimumStock: z.number().int().min(0).max(1_000_000).optional(),
    enabled: z.boolean().optional(),
  }).strict().refine((patch) => Object.keys(patch).some((key) => key !== "listingId")).parse(data))
  .handler(async ({ context, data }): Promise<ApiResult<{ product: Awaited<ReturnType<typeof updateVendorListing>> }>> => {
    try { return ok({ product: await updateVendorListing(context.userId, data) }); }
    catch (err) { return asResult(err); }
  });

export const loadVendorStockHistory = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .validator((data: unknown) => z.object({ listingId: z.string().optional() }).parse(data ?? {}))
  .handler(async ({ context, data }): Promise<ApiResult<{ history: JsonRecord[] }>> => {
    try { return ok({ history: await listVendorStockHistory(context.userId, data.listingId) }); }
    catch (err) { return asResult(err); }
  });

export const loadVendorNotifications = createServerFn({ method: "GET" })
  .middleware([requireRoleMiddleware("VENDOR")])
  .handler(async ({ context }): Promise<ApiResult<{ notifications: JsonRecord[] }>> => {
    try { return ok({ notifications: await listVendorNotifications(context.userId) }); }
    catch (err) { return asResult(err); }
  });

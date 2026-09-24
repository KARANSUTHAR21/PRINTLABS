import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getProduct, getService, listProducts, listServices } from "@/lib/server/catalog";
import { asResult, ok, type ApiResult } from "@/lib/server/errors";
import { requestPasswordReset, resetPasswordWithToken } from "@/lib/server/password-reset";
import type { ProductRow, ServiceRow } from "@/lib/server/catalog";

const listSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(["latest", "price_asc", "price_desc"]).optional(),
});

export const fetchProducts = createServerFn({ method: "GET" })
  .validator((data: unknown) => listSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<ApiResult<{ products: ProductRow[] }>> => {
    try {
      const products = await listProducts(data);
      return ok({ products });
    } catch (err) {
      return asResult(err);
    }
  });

export const fetchProduct = createServerFn({ method: "GET" })
  .validator((id: unknown) => z.string().min(1).parse(id))
  .handler(async ({ data }): Promise<ApiResult<{ product: ProductRow }>> => {
    try {
      const product = await getProduct(data);
      if (!product) return { success: false as const, message: "Product not found.", status: 404 };
      return ok({ product });
    } catch (err) {
      return asResult(err);
    }
  });

export const fetchServices = createServerFn({ method: "GET" }).handler(async (): Promise<ApiResult<{ services: ServiceRow[] }>> => {
  try {
    const services = await listServices();
    return ok({ services });
  } catch (err) {
    return asResult(err);
  }
});

export const fetchService = createServerFn({ method: "GET" })
  .validator((id: unknown) => z.string().min(1).parse(id))
  .handler(async ({ data }): Promise<ApiResult<{ service: ServiceRow }>> => {
    try {
      const service = await getService(data);
      if (!service) return { success: false as const, message: "Service not found.", status: 404 };
      return ok({ service });
    } catch (err) {
      return asResult(err);
    }
  });

export const requestReset = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }): Promise<ApiResult<{ message: string }>> => {
    try {
      const result = await requestPasswordReset(data.email);
      return ok(result);
    } catch (err) {
      return asResult(err);
    }
  });

export const confirmReset = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ token: z.string().min(16), password: z.string().min(8) }).parse(data),
  )
  .handler(async ({ data }): Promise<ApiResult<{ message: string }>> => {
    try {
      const result = await resetPasswordWithToken(data.token, data.password);
      return ok(result);
    } catch (err) {
      return asResult(err);
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getProduct, getService, listProducts, listServices } from "@/lib/server/catalog";
import { asResult, ok, type ApiResult } from "@/lib/server/errors";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";
import {
  checkResetToken,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/lib/server/password-reset";
import {
  requestRegistrationOtp,
  verifyRegistrationOtp,
} from "@/lib/server/registration-otp";
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
  .validator((data: unknown) =>
    z.object({ email: z.string().trim().email().max(254) }).parse(data),
  )
  .handler(async ({ data }): Promise<ApiResult<{ message: string }>> => {
    try {
      const result = await requestPasswordReset(data.email);
      return ok(result);
    } catch (err) {
      return asResult(err);
    }
  });

/** Is this reset link still usable? Drives the page's expired-link state. */
export const checkResetLink = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ token: z.string().trim().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }): Promise<ApiResult<{ valid: boolean }>> => {
    try {
      return ok(await checkResetToken(data.token));
    } catch (err) {
      return asResult(err);
    }
  });

export const confirmReset = createServerFn({ method: "POST" })
  // Deliberately loose: the handler owns the strict checks so a bad link or a
  // weak password comes back as a friendly ApiResult message, not a raw
  // validator rejection the UI cannot render.
  .validator((data: unknown) =>
    z
      .object({
        token: z.string().trim().min(1).max(200),
        password: z
          .string()
          .min(PASSWORD_MIN_LENGTH)
          .max(PASSWORD_MAX_LENGTH),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ApiResult<{ message: string }>> => {
    try {
      const result = await resetPasswordWithToken(data.token, data.password);
      return ok(result);
    } catch (err) {
      return asResult(err);
    }
  });

const registrationSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128)
    .regex(/[a-zA-Z]/, "Password must contain a letter.")
    .regex(/[0-9]/, "Password must contain a number."),
});

/** Step 1 of OTP registration — validate + email a 6-digit code. */
export const requestRegistrationOtpFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => registrationSchema.parse(data))
  .handler(async ({ data }): Promise<ApiResult<{ message: string; expiresInSeconds: number }>> => {
    try {
      const result = await requestRegistrationOtp(data);
      return ok({ message: result.message, expiresInSeconds: result.expiresInSeconds });
    } catch (err) {
      return asResult(err);
    }
  });

/** Step 2 of OTP registration — verify the code and CREATE the account. */
export const verifyRegistrationOtpFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ email: z.string().trim().email(), code: z.string().trim().regex(/^\d{6}$/) })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ApiResult<{ message: string; userId: string }>> => {
    try {
      const result = await verifyRegistrationOtp(data.email, data.code);
      return ok(result);
    } catch (err) {
      return asResult(err);
    }
  });

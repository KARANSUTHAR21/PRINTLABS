import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asResult, ok, type ApiResult } from "@/lib/server/errors";
import { ensureProfile } from "@/lib/server/profile";
import type { AppRole } from "@/lib/auth/roles";

export const loadCurrentRole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ApiResult<{ role: AppRole }>> => {
    try { return ok({ role: (await ensureProfile(context.userId)).role }); }
    catch (err) { return asResult(err); }
  });

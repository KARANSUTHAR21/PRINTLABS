import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { asResult, ok, type ApiResult } from "@/lib/server/errors";
import { ensureProfile } from "@/lib/server/profile";
import type { AppRole } from "@/lib/auth/roles";
import type { AccountType } from "@/lib/auth/account-type";

export const loadCurrentRole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ApiResult<{ role: AppRole; accountType: AccountType; accountTypeSelected: boolean }>> => {
    try {
      const profile = await ensureProfile(context.userId);
      return ok({ role: profile.role, accountType: profile.accountType, accountTypeSelected: profile.accountTypeSelected });
    } catch (err) { return asResult(err); }
  });

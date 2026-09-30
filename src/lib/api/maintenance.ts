import { createServerFn } from "@tanstack/react-start";
import { requireRoleMiddleware } from "@/lib/auth/middleware";
import { reconcileStaleAttempts } from "@/lib/server/payments";

/**
 * Opportunistic reconciliation trigger (spec §31/§32). An authenticated
 * customer may reconcile only their own expired payment attempts; the server
 * releases nothing else
 * (stock is released only via explicit cancel — expiry keeps the reservation
 * so the payment provider cannot oversell in flight). Cheap, idempotent, and
 * safe to call concurrently.
 */
export const reconcilePayments = createServerFn({ method: "POST" })
  .middleware([requireRoleMiddleware("USER")])
  .handler(async ({ context }) => {
    try {
      const result = await reconcileStaleAttempts(50, context.userId);
      return { success: true as const, ...result };
    } catch (err) {
      return {
        success: false as const,
        message: err instanceof Error ? err.message : "Reconciliation failed.",
      };
    }
  });

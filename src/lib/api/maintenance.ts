import { createServerFn } from "@tanstack/react-start";
import { reconcileStaleAttempts } from "@/lib/server/payments";

/**
 * Opportunistic reconciliation trigger (spec §31/§32). Instead of a separate
 * worker process, any client periodically pings this no-auth endpoint; the
 * server expires payment attempts whose TTL lapsed and releases nothing else
 * (stock is released only via explicit cancel — expiry keeps the reservation
 * so the payment provider cannot oversell in flight). Cheap, idempotent, and
 * safe to call concurrently.
 */
export const reconcilePayments = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const result = await reconcileStaleAttempts(50);
    return { success: true as const, ...result };
  } catch (err) {
    return {
      success: false as const,
      message: err instanceof Error ? err.message : "Reconciliation failed.",
    };
  }
});

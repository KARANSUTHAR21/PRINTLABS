import type { Sql } from "@/lib/db";
import { newId } from "./crypto-utils";

export async function audit(
  sql: Sql,
  event: {
    eventType: string;
    orderId?: string | null;
    paymentId?: string | null;
    userId?: string | null;
    status?: string | null;
    providerEventId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await sql`
    insert into audit_logs (
      id, event_type, order_id, payment_id, user_id, status, provider_event_id, metadata
    ) values (
      ${newId("aud")},
      ${event.eventType},
      ${event.orderId ?? null},
      ${event.paymentId ?? null},
      ${event.userId ?? null},
      ${event.status ?? null},
      ${event.providerEventId ?? null},
      ${JSON.stringify(event.metadata ?? {})}::jsonb
    )
  `;
}

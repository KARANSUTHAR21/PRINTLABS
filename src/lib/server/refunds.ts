import { getSql } from "@/lib/db";
import { fail } from "./errors";
import { newId } from "./crypto-utils";
import { requireRole } from "./profile";

export type AdminRefundCase = {
  id: string; orderId: string; customerId: string; customerEmail: string | null;
  paymentId: string | null; totalPaise: number; status: string; reason: string;
  providerReference: string | null; requestedBy: string; createdAt: string; updatedAt: string;
};

export async function listAdminRefundCases(adminId: string): Promise<AdminRefundCase[]> {
  await requireRole(adminId, "ADMIN");
  const sql = await getSql();
  return sql<AdminRefundCase>`
    select r.id, r.order_id as "orderId", o.user_id as "customerId", u.email as "customerEmail",
      o.razorpay_payment_id as "paymentId", o.total_paise as "totalPaise", r.status, r.reason,
      r.provider_reference as "providerReference", r.requested_by as "requestedBy",
      r.created_at::text as "createdAt", r.updated_at::text as "updatedAt"
    from refund_cases r join orders o on o.id = r.order_id
    left join "user" u on u.id = o.user_id
    order by r.created_at desc limit 500
  `;
}

export async function createAdminRefundCase(adminId: string, orderId: string, reason: string) {
  await requireRole(adminId, "ADMIN");
  const sql = await getSql();
  const caseId = newId("refund");
  const rows = await sql<{ id: string }>`
    with eligible as materialized (
      select id from orders where id = ${orderId} and payment_status = 'PAID'
    ), inserted as (
      insert into refund_cases (id, order_id, requested_by, reason)
      select ${caseId}, e.id, ${adminId}, ${reason} from eligible e
      where not exists (select 1 from refund_cases r where r.order_id = e.id
        and r.status in ('OPEN', 'UNDER_REVIEW', 'APPROVED'))
      on conflict (id) do nothing
      returning id, order_id
    ), audited as (
      insert into audit_logs (id, event_type, order_id, user_id, status, metadata)
      select ${newId("audit")}, 'refund_case_opened', i.order_id, ${adminId}, 'OPEN',
        jsonb_build_object('refundCaseId', i.id, 'reason', cast(${reason} as text))
      from inserted i returning order_id
    ) select i.id from inserted i join audited a on a.order_id = i.order_id
  `;
  if (!rows[0]) fail("Paid order not found or an active refund case already exists.", 409, "REFUND_CASE_UNAVAILABLE");
  return { id: rows[0].id };
}

export async function updateAdminRefundCase(
  adminId: string,
  caseId: string,
  status: "UNDER_REVIEW" | "APPROVED" | "DECLINED" | "EXTERNAL_REFUND_RECORDED",
  providerReference?: string,
) {
  await requireRole(adminId, "ADMIN");
  if (status === "EXTERNAL_REFUND_RECORDED" && !providerReference?.trim()) {
    fail("A provider reference is required to record an externally issued refund.", 400);
  }
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    with updated as (
      update refund_cases set status = ${status},
        provider_reference = case when cast(${status} as text) = 'EXTERNAL_REFUND_RECORDED'
          then cast(${providerReference ?? null} as text) else provider_reference end,
        resolved_at = case when cast(${status} as text) in ('DECLINED', 'EXTERNAL_REFUND_RECORDED') then now() else null end,
        updated_at = now()
      where id = ${caseId} and (
        (cast(${status} as text) = 'EXTERNAL_REFUND_RECORDED' and cast(${Boolean(providerReference)} as boolean) and status = 'APPROVED') or
        (cast(${status} as text) = 'UNDER_REVIEW' and status = 'OPEN') or
        (cast(${status} as text) in ('APPROVED', 'DECLINED') and status = 'UNDER_REVIEW')
      )
      returning id, order_id, status
    ), audited as (
      insert into audit_logs (id, event_type, order_id, user_id, status, metadata)
      select ${newId("audit")}, 'refund_case_status', u.order_id, ${adminId}, u.status,
        jsonb_build_object('refundCaseId', u.id, 'providerReference', ${providerReference ?? null}::text)
      from updated u returning order_id
    ) select u.id from updated u join audited a on a.order_id = u.order_id
  `;
  if (!rows[0]) fail("Refund case cannot transition from its current state.", 409, "REFUND_CASE_TRANSITION_REJECTED");
  return { updated: true as const };
}

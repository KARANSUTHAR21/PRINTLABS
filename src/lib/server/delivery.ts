import { getSql } from "@/lib/db";
import { requireRole } from "./profile";
import { fail } from "./errors";
import { getOrderForUser, type OrderRecord } from "./orders";
import { newId } from "./crypto-utils";

export type DeliveryStatus = "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "CANCELLED";
export type DeliveryAssignment = { id: string; orderId: string; deliveryPartnerId: string; status: DeliveryStatus; assignedAt: string; pickedUpAt: string | null; deliveredAt: string | null };

export async function listMyDeliveryAssignments(partnerId: string): Promise<DeliveryAssignment[]> {
  await requireRole(partnerId, "DELIVERY_PARTNER");
  const sql = await getSql();
  return sql<DeliveryAssignment>`
    select da.id, da.order_id as "orderId", da.delivery_partner_id as "deliveryPartnerId", da.status,
      da.assigned_at::text as "assignedAt", da.picked_up_at::text as "pickedUpAt", da.delivered_at::text as "deliveredAt"
    from delivery_assignments da join orders o on o.id = da.order_id
    where da.delivery_partner_id = ${partnerId} and da.status in ('ASSIGNED', 'PICKED_UP')
      and o.payment_status = 'PAID' and o.order_status = 'READY'
    order by da.assigned_at asc
  `;
}

export async function getAssignedDeliveryOrder(partnerId: string, orderId: string): Promise<{ assignment: DeliveryAssignment; order: OrderRecord }> {
  await requireRole(partnerId, "DELIVERY_PARTNER");
  const sql = await getSql();
  const [assignment] = await sql<DeliveryAssignment>`
    select id, order_id as "orderId", delivery_partner_id as "deliveryPartnerId", status,
      assigned_at::text as "assignedAt", picked_up_at::text as "pickedUpAt", delivered_at::text as "deliveredAt"
    from delivery_assignments where delivery_partner_id = ${partnerId} and order_id = ${orderId} limit 1
  `;
  if (!assignment) fail("Assigned delivery order not found.", 404);
  const [orderRow] = await sql<{ user_id: string }>`select user_id from orders where id = ${orderId} limit 1`;
  if (!orderRow) fail("Delivery order not found.", 404);
  const order = await getOrderForUser(orderId, orderRow.user_id);
  if (!order) fail("Delivery order not found.", 404);
  return { assignment, order };
}

export async function createDeliveryRequest(userId: string, orderId: string) {
  await requireRole(userId, "USER");
  const sql = await getSql();
  const requestId = newId("dreq");
  const rows = await sql<{ id: string }>`
    insert into delivery_assignment_requests (id, order_id, user_id)
    select ${requestId}, o.id, ${userId} from orders o
    where o.id = ${orderId} and o.user_id = ${userId}
      and o.payment_status = 'PAID' and o.order_status = 'READY'
      and not exists (select 1 from delivery_assignments da where da.order_id = o.id)
    on conflict (order_id) do update set status = 'PENDING', updated_at = now()
      where delivery_assignment_requests.user_id = excluded.user_id
        and delivery_assignment_requests.status in ('REJECTED', 'CANCELLED')
        and not exists (select 1 from delivery_assignments da where da.order_id = excluded.order_id)
    returning id
  `;
  if (!rows[0]) fail("Eligible paid order not found or delivery was already requested.", 404);
  return { requested: true as const };
}

export async function listDeliveryRequests(adminId: string) {
  await requireRole(adminId, "ADMIN");
  const sql = await getSql();
  return sql<{ id: string; orderId: string; userId: string; status: string; createdAt: string }>`
    select r.id, r.order_id as "orderId", r.user_id as "userId", r.status,
      r.created_at::text as "createdAt"
    from delivery_assignment_requests r
    where r.status = 'PENDING' order by r.created_at asc limit 200
  `;
}

export async function rejectDeliveryRequest(adminId: string, requestId: string, reason?: string) {
  await requireRole(adminId, "ADMIN");
  const sql = await getSql();
  const rows = await sql<{ id: string; order_id: string }>`
    with rejected as (
      update delivery_assignment_requests set status = 'REJECTED', updated_at = now()
      where id = ${requestId} and status = 'PENDING'
      returning id, order_id
    ), audited as (
      insert into audit_logs (id, event_type, order_id, user_id, status, metadata)
      select ${newId("audit")}, 'delivery_request_rejected', r.order_id, ${adminId}, 'REJECTED',
        jsonb_build_object('requestId', r.id, 'reason', ${reason ?? null}::text)
      from rejected r returning order_id
    ) select r.id, r.order_id from rejected r join audited a on a.order_id = r.order_id
  `;
  if (!rows[0]) fail("Pending delivery request not found.", 404);
  return { rejected: true as const };
}

export async function assignDeliveryRequest(adminId: string, requestId: string, partnerId: string) {
  await requireRole(adminId, "ADMIN");
  const sql = await getSql();
  const assignmentId = newId("dassign");
  const notificationId = newId("dnote");
  const rows = await sql<{ id: string; order_id: string; delivery_partner_id: string }>`
    with target as materialized (
      select r.id, r.order_id, r.user_id from delivery_assignment_requests r
      join orders o on o.id = r.order_id
      join user_profiles p on p.user_id = ${partnerId} and p.role = 'DELIVERY_PARTNER'
      where r.id = ${requestId} and r.status = 'PENDING'
        and o.user_id = r.user_id and o.payment_status = 'PAID' and o.order_status = 'READY'
        and not exists (select 1 from delivery_assignments current_assignment where current_assignment.order_id = o.id)
      for update of r, o
    ), assignment as (
      insert into delivery_assignments (id, order_id, delivery_partner_id)
      select ${assignmentId}, t.order_id, ${partnerId} from target t
      on conflict (order_id) do nothing
      returning id, order_id, delivery_partner_id
    ), decision as (
      update delivery_assignment_requests r set status = 'ASSIGNED', updated_at = now()
      from target t, assignment a where r.id = t.id returning r.id
    ), notice as (
      insert into delivery_partner_notifications (id, delivery_partner_id, event_type, title, message)
      select ${notificationId}, a.delivery_partner_id, 'DELIVERY_ASSIGNED', 'New delivery assigned',
        'A paid, ready order has been assigned to you.' from assignment a
      returning delivery_partner_id
    ), audit_event as (
      insert into audit_logs (id, event_type, order_id, user_id, status, metadata)
      select ${newId("audit")}, 'delivery_assigned', a.order_id, ${adminId}, 'ASSIGNED',
        jsonb_build_object('deliveryPartnerId', a.delivery_partner_id, 'assignmentId', a.id)
      from assignment a returning order_id
    )
    select a.id, a.order_id, a.delivery_partner_id from assignment a
    join decision d on true join notice n on true join audit_event e on e.order_id = a.order_id
  `;
  if (!rows[0]) fail("Request or eligible delivery partner not found, or order is no longer ready.", 409, "DELIVERY_ASSIGNMENT_REJECTED");
  return { id: rows[0].id, orderId: rows[0].order_id, deliveryPartnerId: rows[0].delivery_partner_id };
}

export async function updateMyDeliveryStatus(partnerId: string, orderId: string, status: "PICKED_UP" | "DELIVERED") {
  await requireRole(partnerId, "DELIVERY_PARTNER");
  const sql = await getSql();
  if (status === "PICKED_UP") {
    const rows = await sql<DeliveryAssignment>`
      with updated as (
        update delivery_assignments da set status = 'PICKED_UP', picked_up_at = now(), updated_at = now()
        where da.delivery_partner_id = ${partnerId} and da.order_id = ${orderId} and da.status = 'ASSIGNED'
          and exists (select 1 from orders o where o.id = da.order_id and o.payment_status = 'PAID' and o.order_status = 'READY' and o.fulfilled_by is null)
        returning da.id, da.order_id, da.delivery_partner_id, da.assigned_at, da.picked_up_at, da.delivered_at
      ), audited as (
        insert into audit_logs (id, event_type, order_id, user_id, status, metadata)
        select ${newId("audit")}, 'delivery_picked_up', u.order_id, ${partnerId}, 'PICKED_UP',
          jsonb_build_object('assignmentId', u.id) from updated u returning order_id
      )
      select u.id, u.order_id as "orderId", u.delivery_partner_id as "deliveryPartnerId", 'PICKED_UP' as status,
        u.assigned_at::text as "assignedAt", u.picked_up_at::text as "pickedUpAt", u.delivered_at::text as "deliveredAt"
      from updated u join audited a on a.order_id = u.order_id
    `;
    if (!rows[0]) fail("This delivery cannot be picked up: verify assignment, payment, and order readiness.", 409, "DELIVERY_TRANSITION_REJECTED");
    return rows[0];
  }

  // Complete the order and assignment in one statement so concurrent state
  // changes cannot leave one record delivered while the other remains open.
  const rows = await sql<DeliveryAssignment>`
    with completed as (
      update orders o set order_status = 'COMPLETED', fulfilled_at = now(), fulfilled_by = ${partnerId}, updated_at = now()
      where o.id = ${orderId} and o.payment_status = 'PAID' and o.order_status = 'READY'
        and o.fulfilled_by is null
        and exists (select 1 from delivery_assignments da where da.order_id = o.id
          and da.delivery_partner_id = ${partnerId} and da.status = 'PICKED_UP')
      returning o.id
    ), delivered as (
      update delivery_assignments da set status = 'DELIVERED', delivered_at = now(), updated_at = now()
      from completed c where da.order_id = c.id and da.delivery_partner_id = ${partnerId} and da.status = 'PICKED_UP'
      returning da.id, da.order_id, da.delivery_partner_id, da.status, da.assigned_at, da.picked_up_at, da.delivered_at
    ), audited as (
      insert into audit_logs (id, event_type, order_id, user_id, status, metadata)
      select ${newId("audit")}, 'delivery_delivered', d.order_id, ${partnerId}, 'DELIVERED',
        jsonb_build_object('assignmentId', d.id) from delivered d returning order_id
    )
    select d.id, d.order_id as "orderId", d.delivery_partner_id as "deliveryPartnerId", d.status,
      d.assigned_at::text as "assignedAt", d.picked_up_at::text as "pickedUpAt", d.delivered_at::text as "deliveredAt"
    from delivered d join audited a on a.order_id = d.order_id
  `;
  if (!rows[0]) fail("This delivery cannot be completed: verify assignment, payment, pickup, and order readiness.", 409, "DELIVERY_TRANSITION_REJECTED");
  return rows[0];
}

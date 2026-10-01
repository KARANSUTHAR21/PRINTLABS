import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = " ";
const { dbSource, getSql } = await import("../src/lib/db.ts");
assert.equal(dbSource, "pglite", "role access tests must never connect to a configured database");
const { roleCanAccessPath, ROLE_POLICY, APP_ROLES } = await import("../src/lib/auth/roles.ts");
const { requireRole } = await import("../src/lib/server/profile.ts");
const { assignDeliveryRequest, createDeliveryRequest, getAssignedDeliveryOrder, listDeliveryRequests, listMyDeliveryAssignments, rejectDeliveryRequest, updateMyDeliveryStatus } = await import("../src/lib/server/delivery.ts");
const { reviewVendorApplication } = await import("../src/lib/server/vendor.ts");

const run = Math.random().toString(36).slice(2, 9);

test("role matrix separates customer, vendor, admin, and delivery partner routes", () => {
  assert.deepEqual(APP_ROLES, ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"]);
  assert.deepEqual(Object.keys(ROLE_POLICY), [...APP_ROLES]);
  assert.equal(roleCanAccessPath("USER", "/orders/123"), true);
  assert.equal(roleCanAccessPath("USER", "/api/auth/config"), false);
  assert.equal(roleCanAccessPath("ADMIN", "/api/admin/users"), false);
  assert.equal(roleCanAccessPath("USER", "/vendor/inventory"), false);
  assert.equal(roleCanAccessPath("VENDOR", "/vendor/inventory/stock"), true);
  assert.equal(roleCanAccessPath("VENDOR", "/orders"), false);
  assert.equal(roleCanAccessPath("ADMIN", "/vendor/admin"), true);
  assert.equal(roleCanAccessPath("ADMIN", "/delivery/admin"), true);
  assert.equal(roleCanAccessPath("ADMIN", "/vendor/inventory"), false);
  assert.equal(roleCanAccessPath("DELIVERY_PARTNER", "/delivery/dashboard"), true);
  assert.equal(roleCanAccessPath("DELIVERY_PARTNER", "/delivery/orders/another"), true);
  assert.equal(roleCanAccessPath("DELIVERY_PARTNER", "/vendor/orders"), false);
});

test("role guards, vendor promotion workflow, and delivery ownership are enforced", async () => {
  const sql = await getSql();
  const adminId = `rtest_admin_${run}`;
  const userId = `rtest_user_${run}`;
  const deliveryUserId = `rtest_delivery_user_${run}`;
  const vendorId = `rtest_vendor_${run}`;
  const partnerA = `rtest_partner_a_${run}`;
  const partnerB = `rtest_partner_b_${run}`;
  const orderId = `rtest_order_${run}`;
  const assignmentId = `rtest_assignment_${run}`;
  const requestOrderId = `rtest_request_order_${run}`;
  const rejectedOrderId = `rtest_rejected_order_${run}`;
  const applicationId = `rtest_application_${run}`;

  try {
    await sql`insert into user_profiles(user_id, role) values
      (${adminId}, 'ADMIN'), (${userId}, 'USER'), (${deliveryUserId}, 'USER'), (${vendorId}, 'VENDOR'),
      (${partnerA}, 'DELIVERY_PARTNER'), (${partnerB}, 'DELIVERY_PARTNER')`;
    await assert.rejects(() => requireRole(vendorId, "ADMIN"), /permission/i);
    await assert.rejects(() => requireRole(userId, "VENDOR"), /permission/i);

    await sql`insert into vendor_applications(id, user_id, business_name, contact_phone, category, address_line, city, state, pincode, status)
      values (${applicationId}, ${userId}, 'Role Test Shop', '123456789', 'Print', 'Test Road', 'Test City', 'Test State', '12345', 'PENDING')`;
    await reviewVendorApplication(adminId, applicationId, "APPROVED");
    const [promoted] = await sql`select role from user_profiles where user_id = ${userId}`;
    assert.equal(promoted.role, "VENDOR", "vendor promotion is done by Admin application approval");

    await sql`insert into orders(id, user_id, subtotal_paise, tax_paise, total_paise, currency, payment_status, order_status)
      values (${orderId}, ${userId}, 100, 0, 100, 'INR', 'PAID', 'READY')`;
    await sql`insert into delivery_assignments(id, order_id, delivery_partner_id)
      values (${assignmentId}, ${orderId}, ${partnerA})`;

    await sql`insert into orders(id, user_id, subtotal_paise, tax_paise, total_paise, currency, payment_status, order_status)
      values (${requestOrderId}, ${deliveryUserId}, 100, 0, 100, 'INR', 'PAID', 'READY')`;
    assert.deepEqual(await createDeliveryRequest(deliveryUserId, requestOrderId), { requested: true });
    await assert.rejects(() => createDeliveryRequest(vendorId, requestOrderId), /permission/i, "a vendor cannot request delivery for a customer order");
    const pendingRequests = await listDeliveryRequests(adminId);
    const requested = pendingRequests.find((request) => request.orderId === requestOrderId);
    assert.ok(requested);
    await assert.rejects(() => assignDeliveryRequest(vendorId, requested.id, partnerA), /permission/i);
    await assert.rejects(() => assignDeliveryRequest(adminId, requested.id, vendorId), /request or eligible delivery partner/i);
    const assigned = await assignDeliveryRequest(adminId, requested.id, partnerB);
    assert.equal(assigned.deliveryPartnerId, partnerB);
    await assert.rejects(() => assignDeliveryRequest(adminId, requested.id, partnerA), /request or eligible delivery partner/i);
    const [requestStatus] = await sql`select status from delivery_assignment_requests where id = ${requested.id}`;
    assert.equal(requestStatus.status, "ASSIGNED");

    await sql`insert into orders(id, user_id, subtotal_paise, tax_paise, total_paise, currency, payment_status, order_status)
      values (${rejectedOrderId}, ${deliveryUserId}, 100, 0, 100, 'INR', 'PAID', 'READY')`;
    await createDeliveryRequest(deliveryUserId, rejectedOrderId);
    const [rejectedRequest] = await sql`select id from delivery_assignment_requests where order_id = ${rejectedOrderId}`;
    assert.deepEqual(await rejectDeliveryRequest(adminId, rejectedRequest.id, "outside delivery zone"), { rejected: true });
    await assert.rejects(() => assignDeliveryRequest(adminId, rejectedRequest.id, partnerB), /eligible delivery partner/i);
    assert.equal((await listMyDeliveryAssignments(partnerA)).some((assignment) => assignment.orderId === orderId), true);
    assert.equal((await listMyDeliveryAssignments(partnerB)).some((assignment) => assignment.orderId === requestOrderId), true);
    await assert.rejects(() => getAssignedDeliveryOrder(partnerB, orderId), /not found/i);
    await assert.rejects(() => updateMyDeliveryStatus(partnerB, orderId, "PICKED_UP"), /cannot be picked up/i);
    await updateMyDeliveryStatus(partnerA, orderId, "PICKED_UP");
    const delivered = await updateMyDeliveryStatus(partnerA, orderId, "DELIVERED");
    assert.equal(delivered.status, "DELIVERED");
    const [completedOrder] = await sql`select order_status, fulfilled_by from orders where id = ${orderId}`;
    assert.deepEqual(completedOrder, { order_status: "COMPLETED", fulfilled_by: partnerA });
    await assert.rejects(() => updateMyDeliveryStatus(partnerA, orderId, "DELIVERED"), /cannot be completed/i);
  } finally {
    await sql`delete from user_profiles where user_id in (${adminId}, ${userId}, ${deliveryUserId}, ${vendorId}, ${partnerA}, ${partnerB})`;
    await sql`delete from orders where id in (${orderId}, ${requestOrderId}, ${rejectedOrderId})`;
  }
});

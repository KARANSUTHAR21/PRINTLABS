import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = " ";
const { dbSource, getSql } = await import("../src/lib/db.ts");
assert.equal(dbSource, "pglite", "role access tests must never connect to a configured database");
const { roleCanAccessPath, ROUTE_ROLE_GUARDS, ROLE_POLICY, APP_ROLES } = await import("../src/lib/auth/roles.ts");
const { requireCustomerAccount, requireCustomerOrAdmin, requireRole } = await import("../src/lib/server/profile.ts");
const { assignDeliveryRequest, createDeliveryRequest, getAssignedDeliveryOrder, getMyDeliveryEarningsSummary, getMyDeliveryPreferences, listAdminDeliveryPartners, listDeliveryRequests, listMyDeliveryAssignments, listMyDeliveryHistory, listMyDeliveryNotifications, markMyDeliveryNotificationRead, rejectDeliveryRequest, setMyDeliveryAvailability, updateMyDeliveryStatus } = await import("../src/lib/server/delivery.ts");
const { createAdminRefundCase, listAdminRefundCases, updateAdminRefundCase } = await import("../src/lib/server/refunds.ts");
const { reviewVendorApplication } = await import("../src/lib/server/vendor.ts");

const run = Math.random().toString(36).slice(2, 9);

test("role matrix separates customer, vendor, admin, and delivery partner routes", () => {
  assert.deepEqual(APP_ROLES, ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"]);
  assert.deepEqual(Object.keys(ROLE_POLICY), [...APP_ROLES]);
  assert.equal(roleCanAccessPath("USER", "/orders/123"), true);
  assert.equal(roleCanAccessPath("USER", "/admin/users"), false);
  assert.equal(roleCanAccessPath("ADMIN", "/admin/users"), true);
  assert.equal(roleCanAccessPath("VENDOR", "/vendor/support"), true);
  assert.equal(roleCanAccessPath("USER", "/vendor/support"), false);
  assert.equal(roleCanAccessPath("ADMIN", "/delivery/orders"), false);
  assert.equal(roleCanAccessPath("DELIVERY_PARTNER", "/delivery/settings"), true);
  assert.deepEqual(ROUTE_ROLE_GUARDS["/vendor/support"], ["VENDOR", "ADMIN"]);
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
  const unpaidOrderId = `rtest_unpaid_refund_${run}`;

  try {
    await sql`insert into user_profiles(user_id, role, account_type, account_type_selected) values
      (${adminId}, 'ADMIN', 'CUSTOMER', true), (${userId}, 'USER', 'VENDOR', true), (${deliveryUserId}, 'USER', 'CUSTOMER', true), (${vendorId}, 'VENDOR', 'VENDOR', true),
      (${partnerA}, 'DELIVERY_PARTNER', 'CUSTOMER', true), (${partnerB}, 'DELIVERY_PARTNER', 'CUSTOMER', true)`;
    assert.equal((await requireCustomerAccount(deliveryUserId)).accountType, "CUSTOMER");
    assert.equal((await requireCustomerOrAdmin(adminId)).role, "ADMIN");
    assert.equal((await requireCustomerOrAdmin(deliveryUserId)).accountType, "CUSTOMER");
    await assert.rejects(() => requireCustomerOrAdmin(userId), /Customer account access required/i);
    await assert.rejects(() => requireRole(vendorId, "ADMIN"), /permission/i);
    await assert.rejects(() => requireRole(userId, "VENDOR"), /permission/i);
    await assert.rejects(() => requireCustomerAccount(userId), /Customer account access required/i);
    await assert.rejects(() => requireCustomerAccount(vendorId), /Customer account access required/i);
    assert.deepEqual(await getMyDeliveryPreferences(partnerA), { available: true, updatedAt: null });
    await assert.rejects(() => setMyDeliveryAvailability(vendorId, false), /permission/i);
    await assert.rejects(() => listAdminDeliveryPartners(vendorId), /permission/i);
    await assert.rejects(() => listAdminRefundCases(vendorId), /permission/i);

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
    await setMyDeliveryAvailability(partnerB, false);
    await assert.rejects(() => assignDeliveryRequest(adminId, requested.id, partnerB), /request or eligible delivery partner/i, "unavailable partners cannot receive new assignments");
    await setMyDeliveryAvailability(partnerB, true);
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
    assert.equal((await listMyDeliveryNotifications(partnerB)).some((notification) => notification.eventType === "DELIVERY_ASSIGNED"), true);
    const partnerNotifications = await listMyDeliveryNotifications(partnerB);
    await assert.rejects(() => markMyDeliveryNotificationRead(partnerA, partnerNotifications[0].id), /not found/i);
    const [partnerNotice] = await sql`select id from delivery_partner_notifications where delivery_partner_id = ${partnerB} limit 1`;
    assert.deepEqual(await markMyDeliveryNotificationRead(partnerB, partnerNotice.id), { read: true });
    await assert.rejects(() => getAssignedDeliveryOrder(partnerB, orderId), /not found/i);
    await assert.rejects(() => updateMyDeliveryStatus(partnerB, orderId, "PICKED_UP"), /cannot be picked up/i);
    await updateMyDeliveryStatus(partnerA, orderId, "PICKED_UP");
    const delivered = await updateMyDeliveryStatus(partnerA, orderId, "DELIVERED");
    assert.equal(delivered.status, "DELIVERED");
    assert.deepEqual(await listMyDeliveryHistory(partnerA).then((rows) => rows.map((row) => row.orderId)), [orderId]);
    assert.deepEqual(await getMyDeliveryEarningsSummary(partnerA), { deliveredCount: 1, deliveredOrderValuePaise: 100, payoutsConfigured: false });
    await assert.rejects(() => listMyDeliveryHistory(vendorId), /permission/i);
    const [completedOrder] = await sql`select order_status, fulfilled_by from orders where id = ${orderId}`;
    assert.deepEqual(completedOrder, { order_status: "COMPLETED", fulfilled_by: partnerA });
    await assert.rejects(() => updateMyDeliveryStatus(partnerA, orderId, "DELIVERED"), /cannot be completed/i);

    await sql`insert into orders(id, user_id, subtotal_paise, tax_paise, total_paise, currency, payment_status, order_status)
      values (${unpaidOrderId}, ${deliveryUserId}, 100, 0, 100, 'INR', 'CREATED', 'PENDING_PAYMENT')`;
    await assert.rejects(() => createAdminRefundCase(adminId, unpaidOrderId, "Customer requested return"), /paid order not found|duplicate key/i);
    await assert.rejects(() => createAdminRefundCase(vendorId, orderId, "Customer requested return"), /permission/i);
    const refund = await createAdminRefundCase(adminId, orderId, "Customer requested return");
    assert.equal((await listAdminRefundCases(adminId)).some((item) => item.id === refund.id), true);
    await assert.rejects(() => createAdminRefundCase(adminId, orderId, "Duplicate refund request"), /active refund case already exists/i);
    await assert.rejects(() => updateAdminRefundCase(adminId, refund.id, "APPROVED"), /cannot transition/i);
    await updateAdminRefundCase(adminId, refund.id, "UNDER_REVIEW");
    await updateAdminRefundCase(adminId, refund.id, "APPROVED");
    await assert.rejects(() => updateAdminRefundCase(adminId, refund.id, "EXTERNAL_REFUND_RECORDED"), /reference is required/i);
    await updateAdminRefundCase(adminId, refund.id, "EXTERNAL_REFUND_RECORDED", "provider-ref-123");
    const [orderAfterRefundReview] = await sql`select payment_status, razorpay_payment_id from orders where id = ${orderId}`;
    assert.equal(orderAfterRefundReview.payment_status, "PAID", "refund review must not move money or mutate payment status");
    assert.equal(orderAfterRefundReview.razorpay_payment_id, null);
    assert.equal((await listAdminRefundCases(adminId)).find((item) => item.id === refund.id).providerReference, "provider-ref-123");
    await assert.rejects(() => updateAdminRefundCase(adminId, refund.id, "DECLINED"), /cannot transition/i, "external-refund-recorded cases are terminal");
    assert.equal((await listAdminDeliveryPartners(adminId)).some((partner) => partner.userId === partnerA), true);
  } finally {
    await sql`delete from refund_cases where order_id in (${orderId}, ${requestOrderId}, ${rejectedOrderId}, ${unpaidOrderId})`;
    await sql`delete from user_profiles where user_id in (${adminId}, ${userId}, ${deliveryUserId}, ${vendorId}, ${partnerA}, ${partnerB})`;
    await sql`delete from orders where id in (${orderId}, ${requestOrderId}, ${rejectedOrderId}, ${unpaidOrderId})`;
  }
});

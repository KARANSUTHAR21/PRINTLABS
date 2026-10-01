import assert from "node:assert/strict";
import test from "node:test";

// This integration test always uses a fresh in-memory database, never a .env DB.
process.env.DATABASE_URL = " ";
process.env.VITE_AUTH_ENABLED = "false";
const { dbSource, getSql } = await import("../src/lib/db.ts");
assert.equal(dbSource, "pglite", "vendor tests must never connect to a configured database");
const {
  addVendorProduct,
  getVendorAccess,
  getVendorShop,
  listVendorShopsForAdmin,
  reviewVendorApplication,
  setVendorShopAdmin,
  submitVendorApplication,
  updateVendorShop,
  updateVendorStock,
} = await import("../src/lib/server/vendor.ts");

const run = Math.random().toString(36).slice(2, 9);

test("vendor approval, shop ownership, and inventory concurrency are enforced", async () => {
  const sql = await getSql();
  const adminId = `vtest_admin_${run}`;
  const vendorA = `vtest_vendor_a_${run}`;
  const vendorB = `vtest_vendor_b_${run}`;
  const customerId = `vtest_customer_${run}`;
  const productId = `vtest_product_${run}`;
  let listingA;
  let listingB;

  try {
    await sql`
      insert into user_profiles (user_id, role, account_type, account_type_selected)
      values (${adminId}, 'ADMIN', 'CUSTOMER', true),
        (${vendorA}, 'USER', 'VENDOR', true),
        (${vendorB}, 'USER', 'VENDOR', true),
        (${customerId}, 'USER', 'CUSTOMER', true)
    `;
    await sql`
      insert into products (id, name, slug, description, category, price_paise, image, stock)
      values (${productId}, 'Vendor Test Catalog Item', ${productId}, 'test', 'Paper & Printing', 100, '/test.jpg', 10)
    `;

    await assert.rejects(
      () => submitVendorApplication(customerId, {
        businessName: "Customer Shop", contactPhone: "+911112223333", category: "Stationery",
        addressLine: "3 Test Road", city: "Test City", state: "Test State", pincode: "112233",
      }),
      (error) => error.code === "VENDOR_INTENT_REQUIRED",
      "customer registrations cannot submit vendor applications",
    );
    await submitVendorApplication(vendorA, {
      businessName: "Vendor A Shop", contactPhone: "+911234567890", category: "Stationery",
      addressLine: "1 Test Road", city: "Test City", state: "Test State", pincode: "123456",
    });
    const [application] = await sql`select id from vendor_applications where user_id = ${vendorA}`;
    assert.ok(application?.id, "application is persisted");
    const [unapprovedProfile] = await sql`select role from user_profiles where user_id = ${vendorA}`;
    assert.equal(unapprovedProfile.role, "USER", "selecting vendor intent and applying does not grant vendor access");

    const approval = await reviewVendorApplication(adminId, application.id, "APPROVED", "Verified identity documents");
    assert.equal(approval.status, "APPROVED");
    assert.equal((await reviewVendorApplication(adminId, application.id, "APPROVED")).status, "APPROVED", "repeating the same decision is idempotent");
    await assert.rejects(() => reviewVendorApplication(adminId, application.id, "REJECTED"), /already been reviewed/i);
    await assert.rejects(() => reviewVendorApplication(vendorA, application.id, "APPROVED"), /Admin access required/i);

    await submitVendorApplication(vendorB, {
      businessName: "Vendor B Shop", contactPhone: "+919876543210", category: "Stationery",
      addressLine: "2 Test Road", city: "Test City", state: "Test State", pincode: "654321",
    });
    const [applicationB] = await sql`select id from vendor_applications where user_id = ${vendorB}`;
    await reviewVendorApplication(adminId, applicationB.id, "APPROVED");

    const access = await getVendorAccess(vendorA);
    assert.equal(access.role, "VENDOR");
    assert.equal(access.applicationStatus, "APPROVED");
    assert.ok(access.shopId);
    await assert.rejects(() => listVendorShopsForAdmin(vendorA), /Admin access required/i);
    assert.equal((await listVendorShopsForAdmin(adminId)).some((item) => item.vendorId === vendorA), true);

    const shop = await getVendorShop(vendorA);
    assert.equal(shop.name, "Vendor A Shop");
    assert.equal(shop.active, false, "admin approval does not silently activate the shop");
    assert.equal(shop.verified, false, "application approval is not shop verification");

    await updateVendorShop(vendorA, { openingHours: { Monday: "09:00-17:30", Tuesday: "Closed", Wednesday: "Closed", Thursday: "Closed", Friday: "Closed", Saturday: "Closed", Sunday: "Closed" } });
    const validHours = { Monday: "09:00-17:30", Tuesday: "Closed", Wednesday: "Closed", Thursday: "Closed", Friday: "Closed", Saturday: "Closed", Sunday: "Closed" };
    await assert.rejects(() => updateVendorShop(vendorA, { openingHours: { ...validHours, Monday: "25:00-26:00" } }), /valid 24-hour time/i);
    await assert.rejects(() => updateVendorShop(vendorA, { openingHours: { ...validHours, Monday: "17:00-09:00" } }), /closing time must be later than opening time/i);
    await assert.rejects(() => updateVendorShop(vendorA, { openingHours: { Monday: "09:00-17:00" } }), /every day/i);
    await updateVendorShop(vendorA, { email: null });
    await updateVendorShop(vendorA, { images: [] });
    const shopHours = await getVendorShop(vendorA);
    assert.equal(shopHours.email, "", "nullable shop email can be cleared");
    assert.deepEqual(shopHours.images, [], "an explicitly cleared image list is persisted");
    assert.deepEqual(shopHours.opening_hours, { Monday: "09:00-17:30", Tuesday: "Closed", Wednesday: "Closed", Thursday: "Closed", Friday: "Closed", Saturday: "Closed", Sunday: "Closed" }, "vendor opening hours persist with their shop");

    await assert.rejects(
      () => updateVendorShop(vendorA, { isOpen: true }),
      /active, verified shop/i,
      "a vendor cannot open an inactive or unverified shop",
    );
    await assert.rejects(
      () => setVendorShopAdmin(vendorA, access.shopId, { verified: true }),
      /Admin access required/i,
      "a vendor cannot grant shop verification",
    );
    await assert.rejects(() => setVendorShopAdmin(adminId, access.shopId, { active: true }), /must be verified/i);
    await setVendorShopAdmin(adminId, access.shopId, { verified: true });
    await setVendorShopAdmin(adminId, access.shopId, { verified: true });
    await setVendorShopAdmin(adminId, access.shopId, { active: true });
    const [alreadyOpen] = await sql`update vendor_shops set is_open = true where id = ${access.shopId} returning id`;
    assert.ok(alreadyOpen);
    const revoked = await setVendorShopAdmin(adminId, access.shopId, { verified: false });
    assert.equal(revoked.verified, false);
    assert.equal(revoked.active, false, "revoking verification automatically deactivates the shop");
    assert.equal(revoked.isOpen, false, "revoking verification immediately closes the shop");
    await setVendorShopAdmin(adminId, access.shopId, { verified: true });
    await setVendorShopAdmin(adminId, access.shopId, { active: true });

    const createdA = await addVendorProduct(vendorA, {
      productId, sellingPricePaise: 250, quantity: 1, minimumStock: 1,
    });
    assert.ok(createdA?.id);
    listingA = createdA.id;
    const accessB = await getVendorAccess(vendorB);
    await setVendorShopAdmin(adminId, accessB.shopId, { verified: true });
    await setVendorShopAdmin(adminId, accessB.shopId, { active: true });
    const createdB = await addVendorProduct(vendorB, {
      productId, sellingPricePaise: 275, quantity: 3, minimumStock: 1,
    });
    assert.ok(createdB?.id);
    listingB = createdB.id;

    await assert.rejects(
      () => updateVendorStock(vendorA, { listingId: listingB, quantityChange: 1 }),
      /listing not found/i,
      "one vendor cannot mutate another vendor's listing",
    );

    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        updateVendorStock(vendorA, { listingId: listingA, quantityChange: -1 }),
      ),
    );
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1,
      "exactly one concurrent decrement may claim the last unit");
    const [stockA] = await sql`select available_quantity from vendor_products where id = ${listingA}`;
    assert.equal(stockA.available_quantity, 0, "stock never becomes negative");

    await sql`update vendor_subscriptions set expires_at = now() - interval '1 day' where vendor_id = ${vendorA}`;
    assert.equal((await getVendorShop(vendorA)).is_open, false, "an expired plan is not exposed as an open shop");
    await assert.rejects(
      () => setVendorShopAdmin(adminId, access.shopId, { active: true }),
      /active subscription/i,
      "an admin cannot activate a shop after its subscription expires",
    );
    await assert.rejects(
      () => updateVendorStock(vendorA, { listingId: listingA, quantityChange: 1 }),
      /active vendor subscription is required/i,
      "an expired subscription blocks replenishment",
    );
    const [shopAfterAttempt] = await sql`select verified, active from vendor_shops where vendor_id = ${vendorA}`;
    assert.deepEqual(shopAfterAttempt, { verified: true, active: true }, "vendor APIs never mutate admin-owned shop status");
  } finally {
    await sql`delete from user_profiles where user_id in (${adminId}, ${vendorA}, ${vendorB}, ${customerId})`;
    await sql`delete from products where id = ${productId}`;
  }
});

import { getSql } from "@/lib/db";
import { fail } from "./errors";
import { newId } from "./crypto-utils";
import { ensureProfile } from "./profile";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const OPENING_HOURS_PATTERN = /^(?:Closed|(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d)$/;

function validateOpeningHours(hours: Record<string, string>) {
  for (const [day, value] of Object.entries(hours)) {
    if (!(WEEKDAYS as readonly string[]).includes(day)) {
      fail("Only the seven standard weekdays may be configured.", 400, "INVALID_OPENING_HOURS");
    }
    if (!OPENING_HOURS_PATTERN.test(value)) {
      fail("Opening hours must use valid 24-hour time ranges.", 400, "INVALID_OPENING_HOURS");
    }
    if (value !== "Closed" && value.slice(0, 5) >= value.slice(6)) {
      fail("Closing time must be later than opening time.", 400, "INVALID_OPENING_HOURS");
    }
  }
  if (Object.keys(hours).length !== WEEKDAYS.length || WEEKDAYS.some((day) => !(day in hours))) {
    fail("Provide valid opening hours for every day of the week.", 400, "INVALID_OPENING_HOURS");
  }
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;

export type VendorAccess = {
  role: import("@/lib/auth/roles").AppRole;
  applicationStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  shopId: string | null;
  shopName: string | null;
  unreadNotifications: number;
};

export type VendorApplicationRecord = {
  id: string; user_id: string; business_name: string; contact_phone: string;
  category: string; address_line: string; city: string; state: string; pincode: string;
  status: string; submitted_at: string;
};

export type AdminVendorShopRecord = {
  id: string; vendorId: string; name: string; phone: string; email: string;
  category: string; city: string; state: string; active: boolean; verified: boolean;
  verifiedAt: string | null; verifiedBy: string | null; applicationStatus: string; submittedAt: string;
};

export async function getVendorAccess(userId: string): Promise<VendorAccess> {
  const profile = await ensureProfile(userId);
  const sql = await getSql();
  const applications = await sql<{ status: VendorAccess["applicationStatus"] }>`
    select status from vendor_applications where user_id = ${userId} limit 1
  `;
  const shops = profile.role === "VENDOR" ? await sql<{ id: string; name: string }>`
    select id, name from vendor_shops where vendor_id = ${userId} limit 1
  ` : [];
  const notifications = profile.role === "VENDOR" ? await sql<{ count: number }>`
    select count(*)::int as count from vendor_notifications where vendor_id = ${userId} and read_at is null
  ` : [];
  return {
    role: profile.role,
    applicationStatus: applications[0]?.status ?? null,
    shopId: shops[0]?.id ?? null,
    shopName: shops[0]?.name ?? null,
    unreadNotifications: notifications[0]?.count ?? 0,
  };
}

async function requireVendor(userId: string) {
  const profile = await ensureProfile(userId);
  if (profile.role !== "VENDOR") fail("Vendor access required.", 403, "VENDOR_REQUIRED");
  const sql = await getSql();
  const shops = await sql<{ id: string }>`select id from vendor_shops where vendor_id = ${userId} limit 1`;
  if (!shops[0]) fail("Your shop is not available yet. Contact PrintHub support.", 403, "SHOP_NOT_READY");
  return { shopId: shops[0].id };
}

async function activeSubscription(vendorId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; plan_name: string; price_paise: number; billing_cycle: string; status: string; starts_at: string | null; next_due_at: string | null; expires_at: string | null; payment_method: string | null }>`
    select id, plan_name, price_paise, billing_cycle, status,
      starts_at::text as starts_at, next_due_at::text as next_due_at,
      expires_at::text as expires_at, payment_method
    from vendor_subscriptions where vendor_id = ${vendorId} and status = 'ACTIVE' and starts_at <= now() and expires_at > now()
    order by expires_at desc limit 1
  `;
  return rows[0] ?? null;
}

export async function submitVendorApplication(userId: string, input: {
  businessName: string; contactPhone: string; category: string;
  addressLine: string; city: string; state: string; pincode: string;
}) {
  const profile = await ensureProfile(userId);
  if (profile.role !== "USER") fail("Only user accounts can submit a vendor application.", 409);
  const sql = await getSql();
  const [intent] = await sql<{ account_type: string; account_type_selected: boolean }>`
    select account_type, account_type_selected from user_profiles where user_id = ${userId} limit 1
  `;
  if (intent?.account_type !== "VENDOR" || !intent.account_type_selected) {
    fail("Select Vendor during registration before submitting an application.", 409, "VENDOR_INTENT_REQUIRED");
  }
  const id = newId("vapp");
  const submitted = await sql<{ id: string }>`
    insert into vendor_applications (id, user_id, business_name, contact_phone, category, address_line, city, state, pincode, status)
    select ${id}, p.user_id, ${input.businessName}, ${input.contactPhone}, ${input.category},
      ${input.addressLine}, ${input.city}, ${input.state}, ${input.pincode}, 'PENDING'
    from user_profiles p where p.user_id = ${userId} and p.role = 'USER'
      and p.account_type = 'VENDOR' and p.account_type_selected = true
    on conflict (user_id) do update set business_name = excluded.business_name,
      contact_phone = excluded.contact_phone, category = excluded.category,
      address_line = excluded.address_line, city = excluded.city, state = excluded.state,
      pincode = excluded.pincode, status = 'PENDING', submitted_at = now(),
      reviewed_at = null, reviewed_by = null, review_note = null
    where vendor_applications.status = 'REJECTED'
      and exists (select 1 from user_profiles p where p.user_id = excluded.user_id
        and p.role = 'USER' and p.account_type = 'VENDOR' and p.account_type_selected = true)
    returning id
  `;
  if (!submitted[0]) {
    const [current] = await sql<{ status: string }>`select status from vendor_applications where user_id = ${userId} limit 1`;
    if (current?.status === "PENDING") fail("Your vendor application is already under review.", 409);
    if (current?.status === "APPROVED") fail("Your vendor application has already been approved.", 409);
    fail("Vendor account selection is required to submit an application.", 409, "VENDOR_INTENT_REQUIRED");
  }
  return { status: "PENDING" as const };
}

export async function reviewVendorApplication(adminId: string, applicationId: string, decision: "APPROVED" | "REJECTED", note?: string) {
  const admin = await ensureProfile(adminId);
  if (admin.role !== "ADMIN") fail("Admin access required.", 403, "FORBIDDEN");
  const sql = await getSql();
  const rows = await sql<{ id: string; user_id: string; business_name: string; contact_phone: string; category: string; address_line: string; city: string; state: string; pincode: string; status: string }>`
    select id, user_id, business_name, contact_phone, category, address_line, city, state, pincode, status
    from vendor_applications where id = ${applicationId} limit 1
  `;
  const application = rows[0];
  if (!application) fail("Vendor application not found.", 404);
  if (application.status === "APPROVED" || application.status === "REJECTED") {
    if (application.status === decision) return { status: application.status };
    fail("This application has already been reviewed.", 409);
  }
  if (decision === "REJECTED") {
    const rejected = await sql<{ id: string }>`
      update vendor_applications set status = 'REJECTED', reviewed_at = now(),
        reviewed_by = ${adminId}, review_note = ${note ?? null}
      where id = ${applicationId} and status = 'PENDING' returning id
    `;
    if (rejected.length === 0) {
      const [current] = await sql<{ status: string }>`select status from vendor_applications where id = ${applicationId} limit 1`;
      if (current?.status === "REJECTED") return { status: "REJECTED" as const };
      fail("This application has already been reviewed.", 409);
    }
    return { status: "REJECTED" as const };
  }

  // One SQL statement: the role grant, shop, starter trial, and application
  // decision commit atomically (including on pooled Postgres connections).
  const promotedShopId = newId("shop");
  const trialId = newId("sub");
  const approved = await sql<{ status: string }>`
    with pending as materialized (
      select * from vendor_applications where id = ${applicationId} and status = 'PENDING' for update
    ), promoted as (
      update user_profiles p set role = 'VENDOR', updated_at = now()
      from pending a where p.user_id = a.user_id and p.role = 'USER'
      returning p.user_id
    ), created_shop as (
      insert into vendor_shops (id, vendor_id, name, phone, email, category, address_line, city, state, pincode, active, verified)
      select ${promotedShopId}, a.user_id, a.business_name, a.contact_phone, '', a.category,
        a.address_line, a.city, a.state, a.pincode, false, false
      from pending a join promoted p on p.user_id = a.user_id
      on conflict (vendor_id) do nothing returning vendor_id
    ), created_trial as (
      insert into vendor_subscriptions (id, vendor_id, plan_name, price_paise, billing_cycle, status, starts_at, next_due_at, expires_at, payment_method)
      select ${trialId}, p.user_id, 'Starter Trial', 0, 'MONTHLY', 'ACTIVE', now(),
        now() + interval '30 days', now() + interval '30 days', 'TRIAL'
      from promoted p where not exists (
        select 1 from vendor_subscriptions s where s.vendor_id = p.user_id
          and s.status = 'ACTIVE' and s.starts_at <= now() and s.expires_at > now()
      ) returning vendor_id
    ), decision as (
      update vendor_applications a set status = 'APPROVED', reviewed_at = now(),
        reviewed_by = ${adminId}, review_note = ${note ?? null}
      from pending p join promoted v on v.user_id = p.user_id
      where a.id = p.id returning a.status
    ) select status from decision
  `;
  if (approved.length === 0) fail("Application could not be approved; its status may have changed.", 409);
  return { status: "APPROVED" as const };
}

export async function listVendorShopsForAdmin(adminId: string): Promise<AdminVendorShopRecord[]> {
  const admin = await ensureProfile(adminId);
  if (admin.role !== "ADMIN") fail("Admin access required.", 403, "FORBIDDEN");
  const sql = await getSql();
  return sql<AdminVendorShopRecord>`
    select s.id, s.vendor_id as "vendorId", s.name, s.phone, s.email, s.category, s.city, s.state,
      s.active, s.verified, s.verified_at::text as "verifiedAt", s.verified_by as "verifiedBy",
      a.status as "applicationStatus", a.submitted_at::text as "submittedAt"
    from vendor_shops s join vendor_applications a on a.user_id = s.vendor_id
    where a.status = 'APPROVED' order by s.created_at desc
  `;
}

export async function setVendorShopAdmin(adminId: string, shopId: string, patch: { verified?: boolean; active?: boolean }): Promise<Pick<AdminVendorShopRecord, "id" | "vendorId" | "name" | "active" | "verified" | "verifiedAt" | "verifiedBy"> & { isOpen: boolean }> {
  const admin = await ensureProfile(adminId);
  if (admin.role !== "ADMIN") fail("Admin access required.", 403, "FORBIDDEN");
  const sql = await getSql();
  const rows = await sql<Pick<AdminVendorShopRecord, "id" | "vendorId" | "name" | "active" | "verified" | "verifiedAt" | "verifiedBy"> & { isOpen: boolean }>`
    update vendor_shops set
      verified = coalesce(${patch.verified ?? null}, verified),
      active = case when ${patch.active !== undefined} then ${patch.active ?? false}
        when ${patch.verified === false} then false else active end,
      is_open = case when ${patch.active !== undefined ? patch.active : patch.verified === false ? false : true}
        and coalesce(${patch.verified ?? null}, verified)
        and exists (select 1 from vendor_subscriptions sub where sub.vendor_id = vendor_shops.vendor_id
          and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()) then is_open else false end,
      verified_at = case when coalesce(${patch.verified ?? null}, verified)
        then coalesce(verified_at, now()) else null end,
      verified_by = case when coalesce(${patch.verified ?? null}, verified)
        then case when vendor_shops.verified then vendor_shops.verified_by else ${adminId} end else null end,
      updated_at = now()
    where id = ${shopId} and (
      ${patch.active !== true}
      or (coalesce(${patch.verified ?? null}, verified) = true and exists (
        select 1 from vendor_subscriptions sub where sub.vendor_id = vendor_shops.vendor_id
          and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()
      ))
    )
    returning id, vendor_id as "vendorId", name, active, verified,
      verified_at::text as "verifiedAt", verified_by as "verifiedBy", is_open as "isOpen"
  `;
  if (!rows[0]) {
    const [shop] = await sql<{ id: string; verified: boolean; active: boolean }>`select id, verified, active from vendor_shops where id = ${shopId} limit 1`;
    if (!shop) fail("Shop not found.", 404);
    if (patch.active === true && (patch.verified === false || !shop.verified)) {
      fail("A shop must be verified before it can be activated.", 409, "SHOP_NOT_VERIFIED");
    }
    if (patch.active === true) {
      const [subscription] = await sql<{ active: boolean }>`
        select exists (select 1 from vendor_subscriptions sub where sub.vendor_id = (
          select vendor_id from vendor_shops where id = ${shopId}
        ) and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()) as active
      `;
      if (!subscription?.active) fail("An active subscription is required before shop activation.", 409, "SUBSCRIPTION_REQUIRED");
    }
    fail("Shop state changed during the update. Please refresh and try again.", 409, "SHOP_UPDATE_CONFLICT");
  }
  return rows[0];
}

export async function listVendorApplications(adminId: string): Promise<VendorApplicationRecord[]> {
  const admin = await ensureProfile(adminId);
  if (admin.role !== "ADMIN") fail("Admin access required.", 403, "FORBIDDEN");
  const sql = await getSql();
  return sql<VendorApplicationRecord>`
    select id, user_id, business_name, contact_phone, category, address_line, city, state, pincode,
      status, submitted_at::text as submitted_at from vendor_applications
    where status = 'PENDING' order by submitted_at asc
  `;
}

export async function getVendorDashboard(userId: string) {
  const { shopId } = await requireVendor(userId);
  const sql = await getSql();
  const shopRows = await sql<JsonRecord>`
    select id, name, description, phone, email, category, address_line, city, state, pincode,
      latitude, longitude, images, cover_image, opening_hours,
      (is_open and active and verified and exists (
        select 1 from vendor_subscriptions s where s.vendor_id = vendor_shops.vendor_id
          and s.status = 'ACTIVE' and s.starts_at <= now() and s.expires_at > now()
      )) as is_open,
      active, verified, verified_at::text as verified_at, verified_by, created_at::text as created_at,
      exists (select 1 from vendor_subscriptions sub where sub.vendor_id = vendor_shops.vendor_id
        and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()) as subscription_active
    from vendor_shops where id = ${shopId} and vendor_id = ${userId} limit 1
  `;
  const counts = await sql<{ total_products: number; in_stock: number; low_stock: number; out_of_stock: number }>`
    select count(*) filter (where enabled)::int as total_products,
      count(*) filter (where enabled and available_quantity > minimum_stock)::int as in_stock,
      count(*) filter (where enabled and available_quantity > 0 and available_quantity <= minimum_stock)::int as low_stock,
      count(*) filter (where enabled and available_quantity = 0)::int as out_of_stock
    from vendor_products where vendor_id = ${userId} and shop_id = ${shopId}
  `;
  const subscription = await activeSubscription(userId);
  const notifications = await sql<{ unread: number }>`select count(*)::int as unread from vendor_notifications where vendor_id = ${userId} and read_at is null`;
  const recentNotifications = await sql<{ id: string; title: string; message: string; read_at: string | null; created_at: string }>`
    select id, title, message, read_at::text as read_at, created_at::text as created_at
    from vendor_notifications where vendor_id = ${userId}
    order by created_at desc limit 4
  `;
  return {
    shop: shopRows[0] ?? null,
    inventory: counts[0] ?? { total_products: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 },
    subscription, subscriptionActive: Boolean(subscription),
    notificationsUnread: notifications[0]?.unread ?? 0,
    recentNotifications,
    lowStockProducts: await listVendorInventory(userId, { lowStock: true, limit: 5 }),
    today: { orders: null, salesPaise: null, pendingPickups: null },
    integrationNotice: "Shop-scoped checkout and pickup fulfillment are not enabled yet. Order and sales metrics will appear once customer purchases are routed through shop inventory.",
  };
}

export async function getVendorShop(userId: string) {
  const { shopId } = await requireVendor(userId);
  const sql = await getSql();
  const rows = await sql<JsonRecord>`
    select s.id, s.name, s.description, s.phone, s.email, s.category, s.address_line, s.city, s.state, s.pincode,
      s.latitude, s.longitude, s.images, s.cover_image, s.opening_hours,
      (s.is_open and s.active and s.verified and exists (
        select 1 from vendor_subscriptions sub where sub.vendor_id = s.vendor_id
          and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()
      )) as is_open,
      s.active, s.verified, s.verified_at::text as verified_at, s.verified_by,
      s.created_at::text as created_at, s.updated_at::text as updated_at
    from vendor_shops s where s.id = ${shopId} and s.vendor_id = ${userId} limit 1
  `;
  if (!rows[0]) fail("Shop not found.", 404);
  return rows[0];
}

export async function updateVendorShop(userId: string, patch: {
  name?: string; description?: string; phone?: string; email?: string | null; category?: string;
  addressLine?: string; city?: string; state?: string; pincode?: string;
  latitude?: number | null; longitude?: number | null; images?: string[];
  coverImage?: string | null; openingHours?: Record<string, string>; isOpen?: boolean;
}) {
  const { shopId } = await requireVendor(userId);
  const sql = await getSql();
  if (patch.openingHours) validateOpeningHours(patch.openingHours);
  const rows = await sql<JsonRecord>`
    update vendor_shops set name = coalesce(${patch.name ?? null}, name),
      description = coalesce(${patch.description ?? null}, description),
      phone = case when ${patch.phone === undefined} then phone else ${patch.phone ?? ""} end,
      email = case when ${patch.email === undefined} then email else ${patch.email ?? ""} end,
      category = coalesce(${patch.category ?? null}, category),
      address_line = case when ${patch.addressLine === undefined} then address_line else ${patch.addressLine ?? ""} end,
      city = case when ${patch.city === undefined} then city else ${patch.city ?? ""} end,
      state = case when ${patch.state === undefined} then state else ${patch.state ?? ""} end,
      pincode = case when ${patch.pincode === undefined} then pincode else ${patch.pincode ?? ""} end,
      latitude = case when ${patch.latitude === undefined} then latitude else ${patch.latitude ?? null} end,
      longitude = case when ${patch.longitude === undefined} then longitude else ${patch.longitude ?? null} end,
      images = case when ${patch.images === undefined} then images else ${JSON.stringify(patch.images ?? [])}::jsonb end,
      cover_image = case when ${patch.coverImage === undefined} then cover_image else ${patch.coverImage ?? null} end,
      opening_hours = case when ${patch.openingHours === undefined} then opening_hours else ${JSON.stringify(patch.openingHours ?? {})}::jsonb end,
      is_open = case when ${patch.isOpen ?? false} then true
        when ${patch.isOpen === false} then false
        else is_open and active and verified and exists (
          select 1 from vendor_subscriptions sub where sub.vendor_id = ${userId}
            and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()
        )
      end,
      updated_at = now()
    where id = ${shopId} and vendor_id = ${userId}
      and (${patch.isOpen ?? false} = false or (
        active = true and verified = true and exists (
          select 1 from vendor_subscriptions s
          where s.vendor_id = ${userId} and s.status = 'ACTIVE' and s.starts_at <= now() and s.expires_at > now()
        )
      ))
    returning id, name, description, phone, email, category, address_line, city, state, pincode,
      latitude, longitude, images, cover_image, opening_hours,
      (is_open and active and verified and exists (
        select 1 from vendor_subscriptions s where s.vendor_id = ${userId}
          and s.status = 'ACTIVE' and s.starts_at <= now() and s.expires_at > now()
      )) as is_open,
      active, verified, verified_at::text as verified_at, verified_by, updated_at::text as updated_at,
      exists (select 1 from vendor_subscriptions sub where sub.vendor_id = ${userId}
        and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()) as subscription_active
  `;
  if (!rows[0] && patch.isOpen) {
    fail("Only an active, verified shop with an active subscription can open to new orders.", 409, "SHOP_CANNOT_OPEN");
  }
  if (!rows[0]) fail("Shop not found.", 404);
  return rows[0];
}

export type VendorInventoryItem = {
  id: string; vendor_id: string; shop_id: string; product_id: string; selling_price_paise: number;
  available_quantity: number; reserved_quantity: number; sold_quantity: number; minimum_stock: number;
  enabled: boolean; created_at: string; updated_at: string; name: string; slug: string;
  description: string; category: string; image: string;
};

export async function listVendorInventory(userId: string, opts: { lowStock?: boolean; limit?: number } = {}) {
  const { shopId } = await requireVendor(userId);
  const sql = await getSql();
  return sql<VendorInventoryItem>`
    select vp.id, vp.vendor_id, vp.shop_id, vp.product_id, vp.selling_price_paise,
      vp.available_quantity, vp.reserved_quantity, vp.sold_quantity, vp.minimum_stock,
      vp.enabled, vp.created_at::text as created_at, vp.updated_at::text as updated_at,
      p.name, p.slug, p.description, p.category, p.image
    from vendor_products vp join products p on p.id = vp.product_id
    where vp.vendor_id = ${userId} and vp.shop_id = ${shopId}
      and (${opts.lowStock ?? false} = false or (vp.enabled and vp.available_quantity <= vp.minimum_stock))
    order by vp.updated_at desc limit ${opts.limit ?? 500}
  `;
}

async function requireActiveSubscription(userId: string) {
  if (!(await activeSubscription(userId))) fail("An active vendor subscription is required for new listings and stock increases.", 403, "SUBSCRIPTION_REQUIRED");
}

export async function addVendorProduct(userId: string, input: { productId: string; sellingPricePaise: number; quantity: number; minimumStock: number }) {
  const { shopId } = await requireVendor(userId);
  const sql = await getSql();
  const products = await sql<{ id: string }>`select id from products where id = ${input.productId} and active = true limit 1`;
  if (!products[0]) fail("Select an active product from the PrintHub catalog.", 404);
  const id = newId("vprd");
  const inserted = await sql<{ id: string }>`
    with created as (
      insert into vendor_products (id, vendor_id, shop_id, product_id, selling_price_paise, available_quantity, minimum_stock)
      select ${id}, s.vendor_id, s.id, ${input.productId}, ${input.sellingPricePaise}, ${input.quantity}, ${input.minimumStock}
      from vendor_shops s
      join vendor_subscriptions sub on sub.vendor_id = s.vendor_id
        and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()
      join products p on p.id = ${input.productId} and p.active
      where s.id = ${shopId} and s.vendor_id = ${userId} and s.active and s.verified
      on conflict (shop_id, product_id) do nothing returning id, vendor_id, shop_id, available_quantity
    ), recorded as (
      insert into vendor_stock_history (id, vendor_id, shop_id, vendor_product_id, change_quantity, available_after, change_type, note)
      select ${newId("vstk")}, created.vendor_id, created.shop_id, created.id,
        created.available_quantity, created.available_quantity, 'INITIAL', 'Initial shop listing'
      from created returning vendor_product_id
    ) select created.id from created join recorded on recorded.vendor_product_id = created.id
  `;
  if (!inserted[0]) {
    const duplicate = await sql<{ id: string }>`select id from vendor_products where shop_id = ${shopId} and product_id = ${input.productId} limit 1`;
    if (duplicate[0]) fail("This product is already listed in your shop.", 409, "DUPLICATE_LISTING");
    const product = await sql<{ id: string }>`select id from products where id = ${input.productId} and active limit 1`;
    if (!product[0]) fail("Select an active product from the PrintHub catalog.", 404);
    fail("An active, verified shop and subscription are required before adding sale listings.", 403, "SHOP_NOT_SELLING");
  }
  return (await listVendorInventory(userId)).find((item) => item.id === id) ?? null;
}

export async function updateVendorStock(userId: string, input: { listingId: string; quantityChange: number; note?: string }) {
  const { shopId } = await requireVendor(userId);
  const sql = await getSql();
  if (input.quantityChange > 0) await requireActiveSubscription(userId);
  const shop = await sql<{ active: boolean; verified: boolean }>`
    select active, verified from vendor_shops where id = ${shopId} and vendor_id = ${userId} limit 1
  `;
  if (input.quantityChange > 0 && (!shop[0]?.active || !shop[0]?.verified)) {
    fail("An active, verified shop is required before increasing sale inventory.", 403, "SHOP_NOT_SELLING");
  }
  const changeType = input.quantityChange > 0 ? "INCREASE" : "DECREASE";
  // One atomic statement both claims the new availability and records its audit
  // event. Concurrent callers serialize on this vendor listing's DB row.
  const rows = await sql<{ id: string; available_quantity: number }>`
    with updated as (
      update vendor_products vp set available_quantity = vp.available_quantity + ${input.quantityChange}, updated_at = now()
      where vp.id = ${input.listingId} and vp.vendor_id = ${userId} and vp.shop_id = ${shopId}
        and vp.enabled and vp.available_quantity + ${input.quantityChange} >= 0
        and (${input.quantityChange} <= 0 or exists (
          select 1 from vendor_shops s
          join vendor_subscriptions sub on sub.vendor_id = s.vendor_id
            and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()
          where s.id = vp.shop_id and s.vendor_id = ${userId} and s.active and s.verified
        ))
      returning id, available_quantity
    ), recorded as (
      insert into vendor_stock_history (id, vendor_id, shop_id, vendor_product_id, change_quantity, available_after, change_type, note)
      select ${newId("vstk")}, ${userId}, ${shopId}, updated.id, ${input.quantityChange}, updated.available_quantity, ${changeType}, ${input.note ?? ''}
      from updated returning vendor_product_id
    ) select updated.id, updated.available_quantity from updated join recorded on recorded.vendor_product_id = updated.id
  `;
  if (!rows[0]) {
    const owned = await sql<{ id: string }>`select id from vendor_products where id = ${input.listingId} and vendor_id = ${userId} and shop_id = ${shopId} limit 1`;
    if (!owned[0]) fail("Listing not found.", 404);
    fail("Stock update is invalid or this listing is unavailable.", 409, "STOCK_UPDATE_REJECTED");
  }
  return rows[0];
}

export async function updateVendorListing(userId: string, input: { listingId: string; sellingPricePaise?: number; minimumStock?: number; enabled?: boolean }) {
  const { shopId } = await requireVendor(userId);
  if (input.enabled === true) await requireActiveSubscription(userId);
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update vendor_products vp set
      selling_price_paise = coalesce(${input.sellingPricePaise ?? null}, vp.selling_price_paise),
      minimum_stock = coalesce(${input.minimumStock ?? null}, vp.minimum_stock),
      enabled = coalesce(${input.enabled ?? null}, vp.enabled), updated_at = now()
    where vp.id = ${input.listingId} and vp.vendor_id = ${userId} and vp.shop_id = ${shopId}
      and vp.available_quantity >= 0
      and (${input.enabled !== true} or (
        exists (
          select 1 from vendor_shops shop
          join vendor_subscriptions sub on sub.vendor_id = shop.vendor_id
            and sub.status = 'ACTIVE' and sub.starts_at <= now() and sub.expires_at > now()
          where shop.id = vp.shop_id and shop.vendor_id = ${userId} and shop.active and shop.verified
        )
      ))
    returning vp.id
  `;
  if (!rows[0]) {
    const owned = await sql<{ id: string }>`select id from vendor_products where id = ${input.listingId} and vendor_id = ${userId} and shop_id = ${shopId} limit 1`;
    if (!owned[0]) fail("Listing not found.", 404);
    fail("An active shop and subscription are required before enabling a listing.", 403, "SHOP_NOT_SELLING");
  }
  return (await listVendorInventory(userId)).find((item) => item.id === input.listingId) ?? null;
}

export async function listVendorStockHistory(userId: string, listingId?: string) {
  const { shopId } = await requireVendor(userId);
  const sql = await getSql();
  return sql<JsonRecord>`
    select h.id, h.vendor_product_id, h.change_quantity, h.available_after, h.change_type,
      h.note, h.created_at::text as created_at, p.name as product_name
    from vendor_stock_history h join vendor_products vp on vp.id = h.vendor_product_id
    join products p on p.id = vp.product_id where h.vendor_id = ${userId} and h.shop_id = ${shopId}
      and (${listingId ?? ''} = '' or h.vendor_product_id = ${listingId ?? ''})
    order by h.created_at desc limit 200
  `;
}

export async function listVendorNotifications(userId: string) {
  await requireVendor(userId);
  const sql = await getSql();
  return sql<JsonRecord>`
    select id, event_type, title, message, read_at::text as read_at, created_at::text as created_at
    from vendor_notifications where vendor_id = ${userId} order by created_at desc limit 100
  `;
}

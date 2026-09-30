-- Vendor foundation: shops own listings of existing global catalog products.
-- Orders and customer payment flows continue to use the existing commerce schema;
-- shop-scoped checkout and pickup fulfillment are added in a later migration.
alter table user_profiles drop constraint if exists user_profiles_role_chk;
alter table user_profiles add constraint user_profiles_role_chk check (role in ('USER', 'VENDOR', 'ADMIN'));

create table if not exists vendor_applications (
  id text primary key,
  user_id text not null unique references user_profiles(user_id) on delete cascade,
  business_name text not null,
  contact_phone text not null,
  category text not null,
  address_line text not null,
  city text not null,
  state text not null,
  pincode text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text
);
create index if not exists vendor_applications_status_idx on vendor_applications(status, submitted_at desc);

create table if not exists vendor_shops (
  id text primary key,
  vendor_id text not null unique references user_profiles(user_id) on delete cascade,
  name text not null,
  description text not null default '',
  phone text not null default '',
  email text not null default '',
  category text not null default '',
  address_line text not null default '',
  city text not null default '',
  state text not null default '',
  pincode text not null default '',
  latitude double precision,
  longitude double precision,
  images jsonb not null default '[]'::jsonb,
  cover_image text,
  opening_hours jsonb not null default '{}'::jsonb,
  is_open boolean not null default false,
  active boolean not null default false,
  verified boolean not null default false,
  verified_at timestamptz,
  verified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, vendor_id)
);
create index if not exists vendor_shops_active_idx on vendor_shops(active, verified, is_open);

create table if not exists vendor_products (
  id text primary key,
  vendor_id text not null references user_profiles(user_id) on delete cascade,
  shop_id text not null references vendor_shops(id) on delete cascade,
  product_id text not null references products(id),
  selling_price_paise integer not null check (selling_price_paise >= 0),
  available_quantity integer not null default 0 check (available_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  sold_quantity integer not null default 0 check (sold_quantity >= 0),
  minimum_stock integer not null default 5 check (minimum_stock >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, product_id),
  unique (id, vendor_id, shop_id),
  foreign key (shop_id, vendor_id) references vendor_shops(id, vendor_id) on delete cascade
);
create index if not exists vendor_products_owner_idx on vendor_products(vendor_id, shop_id, enabled);
create index if not exists vendor_products_stock_idx on vendor_products(vendor_id, available_quantity, minimum_stock);

create table if not exists vendor_stock_history (
  id text primary key,
  vendor_id text not null references user_profiles(user_id) on delete cascade,
  shop_id text not null references vendor_shops(id) on delete cascade,
  vendor_product_id text not null,
  change_quantity integer not null,
  available_after integer not null check (available_after >= 0),
  change_type text not null check (change_type in ('INITIAL', 'INCREASE', 'DECREASE', 'RESERVE', 'RELEASE', 'SOLD', 'ADJUSTMENT')),
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (vendor_product_id, vendor_id, shop_id)
    references vendor_products(id, vendor_id, shop_id) on delete cascade
);
create index if not exists vendor_stock_history_listing_idx on vendor_stock_history(vendor_id, vendor_product_id, created_at desc);

create table if not exists vendor_subscriptions (
  id text primary key,
  vendor_id text not null references user_profiles(user_id) on delete cascade,
  plan_name text not null,
  price_paise integer not null check (price_paise >= 0),
  billing_cycle text not null check (billing_cycle in ('MONTHLY', 'YEARLY')),
  status text not null check (status in ('PENDING', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED')),
  starts_at timestamptz,
  next_due_at timestamptz,
  expires_at timestamptz,
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendor_subscriptions_owner_idx on vendor_subscriptions(vendor_id, status, expires_at desc);

create table if not exists vendor_notifications (
  id text primary key,
  vendor_id text not null references user_profiles(user_id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists vendor_notifications_owner_idx on vendor_notifications(vendor_id, created_at desc);

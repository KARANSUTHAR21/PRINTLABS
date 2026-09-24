create table if not exists products (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null,
  category text not null,
  price_paise integer not null check (price_paise >= 0),
  image text not null,
  stock integer not null check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on products (category);
create index if not exists products_active_idx on products (active);
create index if not exists products_name_idx on products (name);

create table if not exists services (
  id text primary key,
  slug text not null unique,
  title text not null,
  subtitle text not null,
  description text not null,
  image text not null,
  icon text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_profiles (
  user_id text primary key,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  address_line text,
  city text,
  pincode text,
  role text not null default 'USER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_role_chk check (role in ('USER', 'ADMIN'))
);

create table if not exists cart_items (
  user_id text not null,
  product_id text not null references products(id),
  quantity integer not null check (quantity > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists orders (
  id text primary key,
  user_id text not null,
  subtotal_paise integer not null,
  tax_paise integer not null,
  total_paise integer not null,
  currency text not null default 'INR',
  payment_status text not null,
  order_status text not null,
  active_payment_attempt_id text,
  razorpay_order_id text,
  razorpay_payment_id text,
  invoice_number text unique,
  customer_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_user_id_idx on orders (user_id);
create index if not exists orders_created_at_idx on orders (created_at);
create unique index if not exists orders_razorpay_order_id_uq
  on orders (razorpay_order_id) where razorpay_order_id is not null;

create table if not exists order_items (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  quantity integer not null,
  unit_price_paise integer not null,
  subtotal_paise integer not null
);
create index if not exists order_items_order_id_idx on order_items (order_id);

create table if not exists payment_attempts (
  id text primary key,
  order_id text not null references orders(id),
  user_id text not null,
  attempt_number integer not null,
  idempotency_key text not null unique,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  amount_paise integer not null,
  currency text not null default 'INR',
  status text not null,
  provider_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create unique index if not exists payment_attempts_active_order
  on payment_attempts (order_id)
  where status in ('CREATED', 'PAYMENT_INITIATED', 'PROCESSING');

create table if not exists invoices (
  id text primary key,
  invoice_number text not null unique,
  order_id text not null unique,
  user_id text not null,
  payment_id text,
  payment_status text not null,
  subtotal_paise integer not null,
  tax_paise integer not null,
  total_paise integer not null,
  currency text not null default 'INR',
  items jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists password_resets (
  id text primary key,
  user_id text not null,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id text primary key,
  provider text not null,
  provider_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  event_type text not null,
  order_id text,
  payment_id text,
  user_id text,
  status text,
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_order_id_idx on audit_logs (order_id);

create table if not exists idempotency_keys (
  key text primary key,
  user_id text not null,
  endpoint text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists stock_reservations (
  id text primary key,
  order_id text not null,
  product_id text not null,
  quantity integer not null,
  released boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists invoice_counters (
  year integer primary key,
  n integer not null
);

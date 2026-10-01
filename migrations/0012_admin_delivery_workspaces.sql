-- Delivery availability is partner-owned and defaults to available for newly
-- created Delivery Partner accounts.
create table if not exists delivery_partner_settings (
  delivery_partner_id text primary key references user_profiles(user_id) on delete cascade,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Refunds are request/review records only. No provider API is called and no
-- order/payment state is changed by this queue. A single active case per order
-- prevents duplicate simultaneous refund requests.
create table if not exists refund_cases (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  requested_by text not null references user_profiles(user_id),
  reason text not null,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'EXTERNAL_REFUND_RECORDED')),
  provider_reference text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists refund_cases_one_active_order_idx
  on refund_cases(order_id)
  where status in ('OPEN', 'UNDER_REVIEW', 'APPROVED');
create index if not exists refund_cases_status_idx on refund_cases(status, created_at desc);
create index if not exists refund_cases_order_idx on refund_cases(order_id, created_at desc);

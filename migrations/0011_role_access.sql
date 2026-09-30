-- Canonical PrintHub account roles and delivery-partner ownership records.
alter table user_profiles drop constraint if exists user_profiles_role_chk;
alter table user_profiles add constraint user_profiles_role_chk
  check (role in ('USER', 'VENDOR', 'ADMIN', 'DELIVERY_PARTNER'));

create table if not exists delivery_assignments (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  delivery_partner_id text not null references user_profiles(user_id) on delete cascade,
  status text not null default 'ASSIGNED'
    check (status in ('ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED')),
  assigned_at timestamptz not null default now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (order_id)
);
create index if not exists delivery_assignments_partner_idx
  on delivery_assignments(delivery_partner_id, status, assigned_at desc);

create table if not exists delivery_assignment_requests (
  id text primary key,
  order_id text not null unique references orders(id) on delete cascade,
  user_id text not null references user_profiles(user_id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'ASSIGNED', 'REJECTED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_assignment_requests_status_idx
  on delivery_assignment_requests(status, created_at);

create table if not exists delivery_partner_notifications (
  id text primary key,
  delivery_partner_id text not null references user_profiles(user_id) on delete cascade,
  event_type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists delivery_partner_notifications_owner_idx
  on delivery_partner_notifications(delivery_partner_id, created_at desc);

-- Enforce owner pairs at the database boundary too: a valid order id alone
-- must never allow a payment attempt, invoice, or delivery request to be
-- attached to a different user's account.
create unique index if not exists orders_id_owner_uq on orders(id, user_id);

alter table payment_attempts
  add constraint payment_attempts_order_owner_fk
  foreign key (order_id, user_id) references orders(id, user_id) on delete cascade;

alter table invoices
  add constraint invoices_order_owner_fk
  foreign key (order_id, user_id) references orders(id, user_id) on delete cascade;

alter table delivery_assignment_requests
  add constraint delivery_requests_order_owner_fk
  foreign key (order_id, user_id) references orders(id, user_id) on delete cascade;

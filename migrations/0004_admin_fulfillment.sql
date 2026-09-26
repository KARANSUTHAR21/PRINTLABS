-- Phase 5/6/8 additions: admin product/service management surfaces,
-- order-fulfillment tracking, and a shared rate-limit counter store.

-- Admin product management ----------------------------------------------------
-- `manage_notes` is an internal-only field admins can set on pickup orders.
alter table products add column if not exists manage_notes text;
alter table services add column if not exists manage_notes text;

-- Order fulfillment -----------------------------------------------------------
-- Who moved the order through its lifecycle, and when it was fulfilled.
alter table orders add column if not exists fulfilled_at timestamptz;
alter table orders add column if not exists fulfilled_by text;
alter table orders add column if not exists cancelled_reason text;

-- Shared rate limiting (Phase 8) ----------------------------------------------
-- One counter row per (key, window). The unique constraint lets the limiter
-- upsert-increment atomically; the window_start boundary rolls naturally.
create table if not exists rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- Cleanup helper: old windows are deleted opportunistically by the limiter's
-- occasional sweep (see rate-limit.ts) — no cron needed for correctness.
create index if not exists rate_limit_counters_window_idx
  on rate_limit_counters (window_start);

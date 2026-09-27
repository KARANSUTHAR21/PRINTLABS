-- OTP-based registration (Phase 1 — auth flow).
--
-- A signup starts by storing the registrant's details (password already
-- hashed) plus a hashed 6-digit OTP against their email; the account row is
-- only created after the code is verified, so an unverified email can never
-- sign in. One pending registration per email is active: issuing a new code
-- consumes the previous one (see registration-otp.ts).

create table if not exists registration_otps (
  id text primary key,
  email text not null,
  name text not null,
  password_hash text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists registration_otps_email_created_idx
  on registration_otps (lower(email), created_at desc);

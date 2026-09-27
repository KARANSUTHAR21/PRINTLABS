-- One entry per email address (Phase 1 — auth flow).
--
-- `registration_otps` was append-only: every "send code" click INSERTed another
-- row and marked the older ones consumed, so a single address could appear many
-- times (three rows for the same email was normal after a couple of retries).
-- An email address is an IDENTITY, not a history — the database now enforces
-- that: one row per address, case-insensitively, and re-requesting a code
-- UPDATES that row (new code, fresh expiry, attempts reset) instead of stacking
-- a duplicate.
--
-- `password_resets` gets the same invariant for the same reason: one live reset
-- link per address, replaced rather than accumulated.
--
-- `"user"` already has UNIQUE (email) from 0001_auth; the extra
-- case-insensitive index below closes the `A@x.com` vs `a@x.com` hole so the
-- same person cannot end up with two accounts.

-- ── 1. Collapse existing duplicates (keep the newest row per address) ────────
delete from registration_otps
 where id in (
   select id from (
     select id,
            row_number() over (partition by lower(email) order by created_at desc, id desc) as rn
       from registration_otps
   ) ranked
    where ranked.rn > 1
 );

delete from password_resets
 where id in (
   select id from (
     select id,
            row_number() over (partition by lower(email) order by created_at desc, id desc) as rn
       from password_resets
   ) ranked
    where ranked.rn > 1
 );

-- ── 2. The invariant ────────────────────────────────────────────────────────
create unique index if not exists registration_otps_email_unique
  on registration_otps (lower(email));

create unique index if not exists password_resets_email_unique
  on password_resets (lower(email));

create unique index if not exists user_email_lower_unique
  on "user" (lower(email));

-- ── 3. Indexes the old append-only query shapes needed are now dead weight ──
-- Both were ordered scans over many rows per address; there is exactly one row
-- per address now, and the unique indexes above serve the lookups.
drop index if exists registration_otps_email_created_idx;
drop index if exists password_resets_user_active_idx;

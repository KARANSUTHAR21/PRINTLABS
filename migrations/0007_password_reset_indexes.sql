-- Password reset hardening (Phase 1 — auth flow).
--
-- Issuing a new reset link consumes every previous UNUSED link for the account,
-- and a successful reset burns them all. Both are `where user_id = … and
-- used_at is null` updates, so index exactly that shape — the existing unique
-- index on token_hash only serves the "find by token" lookup, not these.
--
-- Partial (used_at is null) because the table is append-only and the vast
-- majority of rows are already spent; the index stays proportional to the
-- number of LIVE links rather than the table's history.

create index if not exists password_resets_user_active_idx
  on password_resets (user_id)
  where used_at is null;

-- One credential account per user (Phase 1 — auth flow).
--
-- A password reset must be able to SET a password for someone who only ever
-- signed up with Google: there is no `credential` row yet, so Better Auth's
-- `internalAdapter.updatePassword` (an UPDATE) wrote nothing while the API still
-- answered "your password has been updated" and burned the reset link. The fix
-- is an upsert in `setCredentialPassword`, and this index is what makes that
-- upsert safe: `on conflict ("userId") where "providerId" = 'credential'`
-- resolves against it, so two concurrent resets converge on ONE row instead of
-- creating two credential accounts for the same person.
--
-- `insertCredentialUser` (the signup path) already inserts exactly one
-- credential row per new user, and `credentialAccountExists` assumes the same,
-- so this only states an invariant the code already relied on.

-- ── 1. Collapse any duplicate credential rows (keep the most recent) ─────────
-- Not expected to match anything; a duplicate here means two password rows for
-- one person and the newest one is the live password.
delete from "account"
 where "id" in (
   select "id" from (
     select "id",
            row_number() over (
              partition by "userId" order by "updatedAt" desc, "createdAt" desc, "id" desc
            ) as rn
       from "account"
      where "providerId" = 'credential'
   ) ranked
    where ranked.rn > 1
 );

-- ── 2. The invariant ────────────────────────────────────────────────────────
-- Partial: social-only users have no credential row at all, and a plain
-- UNIQUE ("userId", "providerId") would be a different (weaker) guarantee.
create unique index if not exists account_credential_user_unique
  on "account" ("userId")
  where "providerId" = 'credential';

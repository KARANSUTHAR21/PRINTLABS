/**
 * Credential-account creation — the ONE place local email/password users are
 * written to the database.
 *
 * Used by:
 *  - `dev-seed.ts`  (boot-time test account on PGLite)
 *  - `registration-otp.ts` (OTP-verified signup — the real registration path)
 *
 * Inserts the exact rows Better Auth's email/password flow expects (`user`,
 * `account` with providerId "credential") plus the app-side `user_profiles`
 * row. Sequential inserts via the shared `Sql` surface (works on Neon AND
 * PGLite); the unique email constraint is the race guard.
 */
import { randomUUID } from "node:crypto";
import { getSql } from "../db";
import { fail } from "./errors";

export type CredentialAccountInput = {
  email: string;
  name: string;
  /** Better Auth-format password hash (auth.$context.password.hash / hashPassword). */
  passwordHash: string;
  /** OTP-verified signups have proven mailbox ownership → true. */
  emailVerified?: boolean;
  role?: "USER" | "ADMIN";
};

/** Postgres unique-violation (SQLSTATE 23505) — pg and PGLite both set `code`. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/** True when a local credential account already exists for the email. */
export async function credentialAccountExists(email: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql.query<{ count: number }>(
    `select count(*)::int as count
       from "account" a join "user" u on u."id" = a."userId"
      where lower(u."email") = lower($1) and a."providerId" = 'credential'`,
    [email],
  );
  return (rows[0]?.count ?? 0) > 0;
}

/**
 * Create a local credential user. Throws 409 `EMAIL_TAKEN` when the email is
 * already registered (checked inside the same flow — the unique constraint is
 * the final authority).
 */
export async function insertCredentialUser(input: CredentialAccountInput): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const sql = await getSql();

  const taken = await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
  if (taken[0]) fail("An account with this email already exists. Please sign in.", 409, "EMAIL_TAKEN");

  const userId = randomUUID().replaceAll("-", "");
  try {
    await sql.query(
      `insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, now(), now())`,
      [userId, input.name, email, input.emailVerified ?? false],
    );
  } catch (err) {
    // The unique indexes on `email` and `lower(email)` are the final authority.
    // A race with the check above — or a case-variant of an address that
    // already exists (`A@x.com` vs `a@x.com`) — must read as "taken", not 500.
    if (isUniqueViolation(err)) {
      fail("An account with this email already exists. Please sign in.", 409, "EMAIL_TAKEN");
    }
    throw err;
  }
  await sql.query(
    `insert into "account"
       ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
     values ($1, $2, 'credential', $3, $4, now(), now())`,
    [randomUUID().replaceAll("-", ""), userId, userId, input.passwordHash],
  );

  const parts = input.name.trim().split(/\s+/);
  const firstName = parts[0] ?? input.name;
  const lastName = parts.slice(1).join(" ");
  await sql.query(
    `insert into user_profiles (user_id, first_name, last_name, role)
     values ($1, $2, $3, $4)
     on conflict (user_id) do nothing`,
    [userId, firstName, lastName, input.role ?? "USER"],
  );

  return { userId };
}

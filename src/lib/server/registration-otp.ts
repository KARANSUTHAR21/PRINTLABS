/**
 * OTP-based registration (the app's only email/password signup path).
 *
 * Flow: `requestRegistrationOtp` validates the form server-side, stores the
 * registrant (password ALREADY hashed) with a hashed 6-digit code, and emails
 * the code. `verifyRegistrationOtp` checks the code and only then creates the
 * account — an unverified email can never sign in.
 *
 * Security notes:
 *  - OTP stored as sha256 hash; 6 digits, 10-minute expiry, 5 attempts.
 *  - A new request consumes (invalidates) any previous pending code.
 *  - "Already registered" is revealed on the FIRST step (better UX than
 *    withholding it, and no enumeration protection is expected for a shop's
 *    own signup form — same information leaks via sign-in error strings).
 *  - Fire-and-forget mail (spec §75) — SMTP outages never fail the request.
 *  - Response never contains the code even when mail is a logged no-op;
 *    the code is visible in the server console in dev.
 */
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { newId, sha256, randomOTP } from "./crypto-utils";
import { sendRegistrationOtpMail } from "./email";
import { fail } from "./errors";
import { credentialAccountExists, insertCredentialUser } from "./credential-accounts";
import { rateLimit } from "./rate-limit";

export type RegistrationRequestInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type RegistrationRequestResult = {
  message: string;
  /** Seconds until the code expires (UI countdown). */
  expiresInSeconds: number;
  /** True when a previous pending code was invalidated by this request. */
  resend: boolean;
};

export const OTP_TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

export async function requestRegistrationOtp(
  input: RegistrationRequestInput,
): Promise<RegistrationRequestResult> {
  const email = input.email.trim().toLowerCase();
  const name = `${input.firstName.trim()} ${input.lastName.trim()}`.replace(/\s+/g, " ");

  if (!(await rateLimit(`reg-otp:${email}`, 5, 15 * 60_000))) {
    fail("Too many code requests for this email. Try again later.", 429);
  }
  if (await credentialAccountExists(email)) {
    fail("An account with this email already exists. Please sign in.", 409, "EMAIL_TAKEN");
  }

  const sql = await getSql();
  const pending = await sql<{ id: string }>`
    select id from registration_otps
    where lower(email) = ${email} and verified_at is null and consumed_at is null
    order by created_at desc limit 1
  `;
  const resend = pending.length > 0;

  const code = randomOTP();
  const passwordHash = await hashPassword(input.password);
  const expires = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
  const rowId = newId("rot");

  await sql`
    insert into registration_otps (id, email, name, password_hash, code_hash, expires_at)
    values (${rowId}, ${email}, ${name}, ${passwordHash}, ${sha256(code)}, ${expires})
  `;
  if (resend) {
    // Invalidate any OLDER pending codes for this email (never the new row).
    await sql`
      update registration_otps set consumed_at = now()
      where lower(email) = ${email} and id <> ${rowId}
        and verified_at is null and consumed_at is null
    `;
  }

  // Fire-and-forget: delivery failure must not fail the request (spec §75).
  void sendRegistrationOtpMail(email, name, code, OTP_TTL_SECONDS);

  return {
    message: `We sent a 6-digit code to ${email}. Enter it below to create your account.`,
    expiresInSeconds: OTP_TTL_SECONDS,
    resend,
  };
}

export type RegistrationVerifyResult = {
  message: string;
  /** The new user's id — the client uses it to establish the session. */
  userId: string;
};

export async function verifyRegistrationOtp(
  email: string,
  code: string,
): Promise<RegistrationVerifyResult> {
  const normalized = email.trim().toLowerCase();
  if (!(await rateLimit(`reg-verify:${normalized}`, 10, 15 * 60_000))) {
    fail("Too many verification attempts. Try again later.", 429);
  }

  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    password_hash: string;
    code_hash: string;
    attempts: number;
    expires_at: string;
  }>`
    select id, name, password_hash, code_hash, attempts, expires_at::text as expires_at
    from registration_otps
    where lower(email) = ${normalized} and verified_at is null and consumed_at is null
    order by created_at desc limit 1
  `;
  const row = rows[0];
  if (!row) {
    fail("No pending registration for this email. Please start again.", 404, "NO_PENDING");
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    fail("Too many incorrect codes. Request a new one.", 429, "ATTEMPTS_EXCEEDED");
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    fail("This code has expired. Request a new one.", 400, "EXPIRED");
  }
  if (sha256(code.trim()) !== row.code_hash) {
    await sql`update registration_otps set attempts = attempts + 1 where id = ${row.id}`;
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    fail(
      left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.`
        : "Incorrect code. Request a new one.",
      400,
      "BAD_CODE",
    );
  }

  // Mark verified/consumed BEFORE creating the account so a crash can never
  // leave a verified-but-unused code lying around.
  await sql`
    update registration_otps set verified_at = now(), consumed_at = now() where id = ${row.id}
  `;

  const { userId } = await insertCredentialUser({
    email: normalized,
    name: row.name,
    passwordHash: row.password_hash,
    emailVerified: true, // mailbox proven by OTP
  });
  return { message: "Account created. Welcome to PrintHub!", userId };
}

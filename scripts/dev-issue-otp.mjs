#!/usr/bin/env node
/**
 * DEV-ONLY unblock: re-issue a fresh OTP for an EXISTING pending registration
 * while no mail transport is configured (the code would otherwise only appear
 * in the server console).
 *
 *   node --experimental-strip-types --no-warnings \
 *     --import ./scripts/test-register.mjs scripts/dev-issue-otp.mjs <email>
 *
 * It does NOT bypass verification: the account is still created only by the
 * normal `verifyRegistrationOtp` path once the printed code is entered in the
 * UI. The code is stored as a sha256 hash exactly like the real flow, and the
 * registrant's own `name` / `password_hash` from their pending request are
 * carried over — so the account ends up with the details they typed.
 *
 * Refuses to run when a real mail transport is configured (then the normal
 * emailed code is the correct path) and when there is no pending registration.
 */
import { randomInt } from "node:crypto";
import process from "node:process";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("usage: node scripts/dev-issue-otp.mjs <email>");
  process.exit(2);
}

const mailConfigured = Boolean(
  (process.env.BREVO_API_KEY ?? "").trim() || (process.env.MAIL_SERVER ?? "").trim(),
);
if (mailConfigured) {
  console.error(
    "[dev-issue-otp] a mail transport IS configured — the normal emailed code is the\n" +
      "                correct path. This helper is only for the logged no-op fallback.",
  );
  process.exit(2);
}

const { Client } = await import("pg");
const { sha256, newId } = await import("../src/lib/server/crypto-utils.ts");

const pool = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")
    ? undefined
    : { rejectUnauthorized: false },
});
await pool.connect();

const TTL_SECONDS = 10 * 60;

try {
  const { rows } = await pool.query(
    `select id, name, password_hash from registration_otps
      where lower(email) = $1 and verified_at is null and consumed_at is null
      order by created_at desc limit 1`,
    [email],
  );
  if (rows.length === 0) {
    console.error(
      `[dev-issue-otp] no pending registration for ${email}.\n` +
        "               Start the signup form once, then re-run this.",
    );
    process.exit(1);
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const rowId = newId("rot");
  const expires = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

  // Mirror the real request: consume older pending codes, keep the newest.
  await pool.query(
    `update registration_otps set consumed_at = now()
      where lower(email) = $1 and verified_at is null and consumed_at is null`,
    [email],
  );
  await pool.query(
    `insert into registration_otps (id, email, name, password_hash, code_hash, expires_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [rowId, email, rows[0].name, rows[0].password_hash, sha256(code), expires],
  );

  console.log(`\n[dev-issue-otp] email: ${email}`);
  console.log(`[dev-issue-otp] name carried over: ${rows[0].name}`);
  console.log(`[dev-issue-otp] CODE: ${code}   (valid ${TTL_SECONDS / 60} minutes)\n`);
} finally {
  await pool.end();
}

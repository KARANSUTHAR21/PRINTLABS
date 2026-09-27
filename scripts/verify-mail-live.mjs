#!/usr/bin/env node
/**
 * Live transactional-mail check (spec Phase 7 — Brevo transport).
 *
 *   npm run verify:mail                # checks the two default receivers below
 *   npm run verify:mail -- a@b.c d@e.f # optional receivers (still capped at 2)
 *   npm run verify:mail -- --check     # transport preflight only — sends nothing
 *
 * This is the end-to-end proof that OTP mail really LEAVES the app:
 *
 *   1. Prints the configured transport (never the secret itself).
 *   2. SMTP preflight with nodemailer `verify()` — surfaces the exact relay
 *      error (e.g. `535 5.7.8 Authentication failed`) instead of the app's
 *      swallowed failure.
 *   3. Mints codes through `requestRegistrationOtp` — the app's ONLY signup
 *      path — so each recipient gets a USABLE code, and watches the
 *      fire-and-forget send for the transport's own success/failure log line.
 *
 * It hits real mailboxes: sends are capped at MAX_SENDS (default 2).
 */
import process from "node:process";
import { loadEnvFile } from "./load-env.mjs";
import { watchMailLog } from "./mail-log-watch.mjs";

loadEnvFile();

const DEFAULT_RECEIVERS = ["skar34242@gmail.com", "karansuthar21092006@gmail.com"];
const MAX_SENDS = 2;
const SEND_WAIT_MS = 25_000;

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const passed = args.filter((a) => !a.startsWith("--"));
const receivers = passed.length ? passed : DEFAULT_RECEIVERS;
if (checkOnly) receivers.length = 0; // preflight only — never mint a code

if (receivers.length > MAX_SENDS) {
  console.error(`[verify:mail] refusing to send ${receivers.length} emails — cap is ${MAX_SENDS}.`);
  process.exit(2);
}

const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
if (!databaseUrl) {
  console.error(
    "[verify:mail] DATABASE_URL is not set — OTP codes are stored in Postgres\n" +
      "             (Supabase). Set it in .env and re-run.",
  );
  process.exit(2);
}

const emailMod = await import("../src/lib/server/email.ts");
const { requestRegistrationOtp } = await import("../src/lib/server/registration-otp.ts");
const { Pool } = await import("pg");

const host = (process.env.MAIL_SERVER ?? "").trim();
const apiKey = (process.env.BREVO_API_KEY ?? "").trim();

console.log("[verify:mail] transport:");
console.log(`  BREVO_API_KEY  ${apiKey ? `set (${apiKey.slice(0, 8)}…)` : "unset"}`);
console.log(`  MAIL_SERVER    ${host || "unset"}`);
console.log(`  MAIL_PORT      ${(process.env.MAIL_PORT ?? "").trim() || "unset"}`);
console.log(`  MAIL_SECURE    ${(process.env.MAIL_SECURE ?? "").trim() || "unset"}`);
console.log(`  MAIL_USER      ${(process.env.MAIL_USER ?? "").trim() || "unset"}`);
console.log(
  `  MAIL_PASSWORD  ${(process.env.MAIL_PASSWORD ?? "").trim() ? "set" : "unset"}`,
);
console.log(`  MAIL_FROM      ${(process.env.MAIL_FROM ?? "").trim() || "unset"}`);
console.log(
  `  receivers      ${receivers.length ? receivers.join(", ") : "(none — preflight only)"}\n`,
);

if (!emailMod.mailConfigured()) {
  console.error("[verify:mail] FAILED — no transport configured (set MAIL_SERVER or BREVO_API_KEY).");
  process.exit(1);
}

// ── 1. Relay preflight: fail fast with the REAL SMTP error ──────────────────
if (host) {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.MAIL_PORT ?? 587),
    secure: (process.env.MAIL_SECURE ?? "").trim() === "true",
    auth:
      (process.env.MAIL_USER ?? "").trim() && (process.env.MAIL_PASSWORD ?? "").trim()
        ? {
            user: process.env.MAIL_USER.trim(),
            pass: process.env.MAIL_PASSWORD.trim(),
          }
        : undefined,
  });
  try {
    await transport.verify();
    console.log(`✔ SMTP relay accepted the credentials (${host}:${process.env.MAIL_PORT ?? 587})`);
  } catch (err) {
    console.error(`✘ SMTP preflight failed: ${err instanceof Error ? err.message : err}`);
    console.error("  → fix the MAIL_* credentials in .env and re-run.");
    process.exit(1);
  }
}

if (checkOnly) {
  console.log("\n[verify:mail] --check: transport reachable, no email sent.\n");
  process.exit(0);
}

// ── 2. Watch the fire-and-forget send for its result ───────────────────────
// `sendMail` never throws (spec §75), so delivery is confirmed from the
// transport's own log line — see `mail-log-watch.mjs` (unit tested).

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
});

let failures = 0;
let sends = 0;

for (const to of receivers) {
  const email = to.trim().toLowerCase();
  console.log(`\n── ${email} ──────────────────────────────────────────`);
  let watched = null;
  try {
    watched = watchMailLog({ to: email, timeoutMs: SEND_WAIT_MS });
    const result = await requestRegistrationOtp({
      firstName: "Karan",
      lastName: "Suthar",
      email,
      password: "Passw0rd!23",
    });
    sends += 1;
    console.log(`  code minted · expires in ${result.expiresInSeconds}s${result.resend ? " · (resent)" : ""}`);
  } catch (err) {
    console.error(`  ✘ request rejected: ${err instanceof Error ? err.message : err}`);
    failures += 1;
    watched?.stop(); // nothing was sent — release the console hooks now
    continue;
  }

  const outcome = await watched.result;
  if (outcome.status === "sent") {
    console.log(`  ✔ DELIVERED via ${outcome.transport} (relay id ${outcome.id}) — check the inbox`);
  } else if (outcome.status === "failed") {
    failures += 1;
    console.error(`  ✘ send failed: ${outcome.detail}`);
  } else {
    failures += 1;
    console.error(`  ✘ ${outcome.detail}`);
  }

  const rows = await pool.query(
    `select id, created_at::text as created_at, expires_at::text as expires_at
       from registration_otps
      where lower(email) = $1 and verified_at is null and consumed_at is null
      order by created_at desc limit 1`,
    [email],
  );
  if (rows.rows[0]) {
    console.log(`  pending row ${rows.rows[0].id} · expires ${rows.rows[0].expires_at}`);
  }
}

await pool.end();
console.log(`\n[verify:mail] ${sends} email(s) sent · ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

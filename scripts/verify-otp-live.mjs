#!/usr/bin/env node
/**
 * Live registration-OTP verification (spec: OTP-based signup).
 *
 *   npm run verify:otp
 *
 * Runs against the CONFIGURED `DATABASE_URL` (Supabase in this workspace) and
 * proves the registration flow uses a REAL crypto-random code — never a fixed
 * dummy such as `123456`:
 *
 *   1. Each request generates a fresh 6-digit code (N requests → N distinct
 *      codes, none of them a well-known dummy).
 *   2. The stored `code_hash` is exactly `sha256(code)` — the emailed code is
 *      the one that was persisted (and it is persisted only as a hash).
 *   3. A DUMMY code (`123456`, or the next dummy when a real code collides) is
 *      REJECTED and the attempt counter increments.
 *   4. The REAL code is accepted, and only then is the account created — with
 *      `emailVerified: true`.
 *   5. A resend invalidates the previous code: the old code fails, the newest
 *      code succeeds.
 *   6. A verified code is single-use (a second verify finds nothing pending).
 *   7. The code is valid for exactly 10 minutes: `expires_at − created_at` is
 *      600s, a code with time left on the clock is accepted, and a code past
 *      its deadline is REJECTED (and never creates an account).
 *
 * Every row it creates is deleted again, so the database is left as found.
 */
import process from "node:process";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

// Force the logged no-op transport: this script reads the code out of the
// `[email:nop]` console line, and must never send real mail to its
// `otp.*@example.com` fixtures (which would also hard-bounce at the relay).
process.env.MAIL_SERVER = "";
process.env.BREVO_API_KEY = "";

const databaseUrl = (process.env.DATABASE_URL ?? "").trim();
if (!databaseUrl) {
  console.error(
    "[verify:otp] DATABASE_URL is not set — this check targets a real Postgres\n" +
      "            (Supabase). Set it in .env and re-run.",
  );
  process.exit(2);
}

const { requestRegistrationOtp, verifyRegistrationOtp } = await import(
  "../src/lib/server/registration-otp.ts"
);
const { sha256 } = await import("../src/lib/server/crypto-utils.ts");
const { Pool } = await import("pg");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
});

const PASSWORD = "Passw0rd!23";
const RUN = Date.now().toString(36);
const email = (tag) => `otp.${tag}.${RUN}@example.com`;

/** Well-known dummy codes a lazy implementation might hardcode. */
const DUMMY_CODES = [
  "123456",
  "000000",
  "111111",
  "123123",
  "654321",
  "112233",
  "123321",
  "010101",
  "999999",
  "696969",
];

let failures = 0;
let checks = 0;
function check(label, condition, detail = "") {
  checks += 1;
  const suffix = detail ? ` — ${detail}` : "";
  if (condition) console.log(`  \u2714 ${label}${suffix}`);
  else {
    failures += 1;
    console.error(`  \u2718 ${label}${suffix}`);
  }
}

/**
 * Calls the real request path and captures the code from the fire-and-forget
 * mail line (`[email:nop] … verification code`), since the response body never
 * contains it. Waits for the async log rather than assuming it already fired.
 */
async function requestAndCapture(tag, firstName = "Otp", lastName = "Tester") {
  const target = email(tag);
  const seen = [];
  const original = console.info;
  console.info = (...args) => {
    seen.push(args);
    original(...args);
  };
  try {
    const result = await requestRegistrationOtp({
      firstName,
      lastName,
      email: target,
      password: PASSWORD,
    });
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      for (const args of seen) {
        for (const arg of args) {
          if (typeof arg !== "string") continue;
          const subjectMatch = /^(\d{6}) is your PrintHub verification code$/.exec(arg);
          if (subjectMatch) return { email: target, code: subjectMatch[1], result };
          const bodyMatch = /verification code is:\s*(\d{6})/.exec(arg);
          if (bodyMatch) return { email: target, code: bodyMatch[1], result };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`no OTP mail captured for ${target}`);
  } finally {
    console.info = original;
  }
}

async function otpRow(target) {
  const { rows } = await pool.query(
    `select code_hash, attempts, verified_at, consumed_at, expires_at
       from registration_otps where lower(email) = $1
      order by created_at desc limit 1`,
    [target],
  );
  return rows[0] ?? null;
}

async function userIdFor(target) {
  const { rows } = await pool.query('select id, "emailVerified" from "user" where lower(email) = $1', [
    target,
  ]);
  return rows[0] ?? null;
}

async function cleanup(targets) {
  for (const target of targets) {
    const user = await userIdFor(target);
    if (user) {
      await pool.query("delete from session where \"userId\" = $1", [user.id]);
      await pool.query('delete from account where "userId" = $1', [user.id]);
      await pool.query("delete from user_profiles where user_id = $1", [user.id]);
      await pool.query('delete from "user" where id = $1', [user.id]);
    }
    await pool.query("delete from registration_otps where lower(email) = $1", [target]);
  }
}

const created = [];
try {
  console.log(`\n[verify:otp] target: ${new URL(databaseUrl).host}\n`);

  // ── 1. A real, non-dummy, hashed code ────────────────────────────────────
  console.log("1. Real code generation + storage");
  const first = await requestAndCapture("a");
  created.push(first.email);
  check("code is exactly 6 digits", /^\d{6}$/.test(first.code), `got "${first.code}"`);
  check("code is not a known dummy", !DUMMY_CODES.includes(first.code), `got "${first.code}"`);
  check("response is a resend-free first send", first.result.resend === false);
  check("response body never contains the code", !JSON.stringify(first.result).includes(first.code));

  const row = await otpRow(first.email);
  check("pending row exists in the database", Boolean(row));
  check("stored value is sha256(code)", row?.code_hash === sha256(first.code));
  check("stored value is NOT the plaintext code", row?.code_hash !== first.code);
  check("starts with 0 attempts", row?.attempts === 0, `attempts=${row?.attempts}`);

  // ── 2. Randomness across requests ────────────────────────────────────────
  console.log("\n2. Randomness (5 fresh requests must all differ)");
  const codes = new Set([first.code]);
  for (const tag of ["b", "c", "d", "e"]) {
    const next = await requestAndCapture(tag);
    created.push(next.email);
    check(`code for ${tag} is not a dummy`, !DUMMY_CODES.includes(next.code), `got "${next.code}"`);
    codes.add(next.code);
  }
  check("all 5 generated codes are distinct", codes.size === 5, `${codes.size}/5 unique`);

  // ── 3. A dummy code is rejected ──────────────────────────────────────────
  console.log("\n3. Dummy code rejection");
  const target = await requestAndCapture("f");
  created.push(target.email);
  const dummy = DUMMY_CODES.find((candidate) => candidate !== target.code);
  let dummyError = null;
  try {
    await verifyRegistrationOtp(target.email, dummy);
  } catch (err) {
    dummyError = err;
  }
  check("dummy code is rejected", Boolean(dummyError), `"${dummy}" → ${dummyError?.message ?? "ACCEPTED!"}`);
  check("rejection says the code was incorrect", /incorrect code/i.test(dummyError?.message ?? ""));
  const afterDummy = await otpRow(target.email);
  check("attempt counter incremented", afterDummy?.attempts === 1, `attempts=${afterDummy?.attempts}`);
  check("account NOT created for a rejected code", (await userIdFor(target.email)) === null);

  // ── 4. The real code is accepted ─────────────────────────────────────────
  console.log("\n4. Real code acceptance");
  const verified = await verifyRegistrationOtp(target.email, target.code);
  check("real code returns a userId", typeof verified.userId === "string" && verified.userId.length > 0);
  const user = await userIdFor(target.email);
  check("account created", Boolean(user));
  check("account email is verified", user?.emailVerified === true);
  const consumed = await otpRow(target.email);
  check("code marked verified", consumed?.verified_at !== null);
  check("code marked consumed", consumed?.consumed_at !== null);

  // ── 5. Verified code is single-use ───────────────────────────────────────
  console.log("\n5. Single-use enforcement");
  let reuseError = null;
  try {
    await verifyRegistrationOtp(target.email, target.code);
  } catch (err) {
    reuseError = err;
  }
  check("replaying the verified code fails", Boolean(reuseError), reuseError?.message ?? "ACCEPTED!");

  // ── 6. Resend invalidates the previous code ──────────────────────────────
  console.log("\n6. Resend invalidation");
  const resendTarget = await requestAndCapture("g");
  created.push(resendTarget.email);
  const second = await requestAndCapture("g");
  check("resend flag set on the second request", second.result.resend === true);
  check("resend issues a different code", second.code !== resendTarget.code, `${resendTarget.code} → ${second.code}`);

  let staleError = null;
  try {
    await verifyRegistrationOtp(resendTarget.email, resendTarget.code);
  } catch (err) {
    staleError = err;
  }
  check("previous code rejected after resend", Boolean(staleError), staleError?.message ?? "ACCEPTED!");

  const okResend = await verifyRegistrationOtp(resendTarget.email, second.code);
  check("newest code accepted", typeof okResend.userId === "string");

  // ── 7. The 10-minute clock ───────────────────────────────────────────────
  console.log("\n7. 10-minute validity window");
  /**
   * Simulate the passage of time instead of waiting 10 real minutes. The
   * deadline is written from the NODE clock — the same clock
   * `verifyRegistrationOtp` compares against — so the boundary is exact
   * (measuring against `now()`, the database clock, would only prove the
   * skew between the two hosts).
   */
  async function shiftDeadline(target, seconds) {
    const when = new Date(Date.now() + seconds * 1000).toISOString();
    const { rowCount } = await pool.query(
      `update registration_otps set expires_at = $2::timestamptz
        where lower(email) = $1 and verified_at is null and consumed_at is null`,
      [target, when],
    );
    check(
      `deadline moved to ${seconds > 0 ? `+${seconds}` : seconds}s (${target.split(".")[1]})`,
      rowCount === 1,
    );
  }

  const insideTarget = await requestAndCapture("h");
  created.push(insideTarget.email);
  check(
    "response announces a 600s TTL (what the UI counts down)",
    insideTarget.result.expiresInSeconds === 600,
    `expiresInSeconds=${insideTarget.result.expiresInSeconds}`,
  );
  const ttl = await pool.query(
    `select extract(epoch from (expires_at - now())) as seconds_left
       from registration_otps where lower(email) = $1
      order by created_at desc limit 1`,
    [insideTarget.email],
  );
  const secondsLeft = Number(ttl.rows[0]?.seconds_left);
  check(
    "stored deadline is 10 minutes out (allow <2s host clock skew)",
    Math.abs(secondsLeft - 600) <= 2,
    `${secondsLeft.toFixed(2)}s`,
  );

  // 2 seconds left → still inside the window.
  await shiftDeadline(insideTarget.email, 2);
  let insideOk = null;
  let insideError = null;
  try {
    insideOk = await verifyRegistrationOtp(insideTarget.email, insideTarget.code);
  } catch (err) {
    insideError = err;
  }
  check(
    "code with 2s left is still accepted",
    typeof insideOk?.userId === "string",
    insideError?.message ?? "accepted",
  );

  // Past the deadline → rejected, no account, and no attempt burned.
  const expiredTarget = await requestAndCapture("i");
  created.push(expiredTarget.email);
  await shiftDeadline(expiredTarget.email, -1);
  let expiredError = null;
  try {
    const accepted = await verifyRegistrationOtp(expiredTarget.email, expiredTarget.code);
    console.error(`  !! expired code was ACCEPTED for ${expiredTarget.email} → ${accepted.userId}`);
  } catch (err) {
    expiredError = err;
  }
  check(
    "code 1s past the deadline is rejected",
    Boolean(expiredError),
    expiredError?.message ?? "ACCEPTED!",
  );
  check("rejection says the code expired", /expired/i.test(expiredError?.message ?? ""));
  const expiredRow = await otpRow(expiredTarget.email);
  check("expired code did not burn an attempt", expiredRow?.attempts === 0, `attempts=${expiredRow?.attempts}`);
  check("expired code is NOT marked verified", expiredRow?.verified_at === null);
  check("no account created from an expired code", (await userIdFor(expiredTarget.email)) === null);

  // Recovery: requesting a fresh code after expiry restarts the 10 minutes.
  const retry = await requestAndCapture("i");
  const retryTtl = await pool.query(
    `select extract(epoch from (expires_at - now()))::int as seconds_left
       from registration_otps where lower(email) = $1
      order by created_at desc limit 1`,
    [expiredTarget.email],
  );
  check(
    "a fresh code after expiry gets a full 10 minutes",
    Math.abs(Number(retryTtl.rows[0]?.seconds_left) - 600) <= 3,
    `${Number(retryTtl.rows[0]?.seconds_left).toFixed(2)}s left`,
  );
  const afterRetry = await verifyRegistrationOtp(expiredTarget.email, retry.code);
  check("the fresh code is accepted", typeof afterRetry.userId === "string");
} finally {
  await cleanup(created);
  await pool.end();
}

console.log(
  failures === 0
    ? `\n\u2714 verify:otp — all ${checks} checks passed.\n`
    : `\n\u2718 verify:otp — ${failures}/${checks} checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

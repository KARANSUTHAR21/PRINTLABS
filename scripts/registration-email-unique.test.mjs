import assert from "node:assert/strict";
import test from "node:test";

/**
 * "A person can enter an email once" — enforced by the DATABASE, not just by a
 * read-then-write check in application code:
 *
 *  - `registration_otps` holds ONE row per address (case-insensitively); a
 *    repeat request replaces the code instead of stacking a duplicate;
 *  - the replaced code stops working and the new one verifies;
 *  - `"user"` refuses a second account for the same address, even when the
 *    casing differs.
 *
 * Runs against PGLite with mail forced to the logged no-op.
 */

process.env.DATABASE_URL = " ";
process.env.MAIL_SERVER = "";
process.env.BREVO_API_KEY = "";

const { requestRegistrationOtp, verifyRegistrationOtp } = await import(
  "../src/lib/server/registration-otp.ts"
);
const { insertCredentialUser } = await import("../src/lib/server/credential-accounts.ts");
const { submitVendorApplication } = await import("../src/lib/server/vendor.ts");
const { getSql } = await import("../src/lib/db.ts");
const { sha256 } = await import("../src/lib/server/crypto-utils.ts");

const RUN = Math.random().toString(36).slice(2, 8);
const details = (email) => ({
  firstName: "Email",
  lastName: "Once",
  email,
  password: "Passw0rd!1",
  accountType: "CUSTOMER",
});

/** Run `fn` while capturing the no-op mail log and return the emailed OTP. */
async function captureOtp(fn) {
  const lines = [];
  const original = console.info;
  console.info = (...args) => lines.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.info = original;
  }
  return lines.join("\n").match(/verification code is: (\d{6})/)?.[1] ?? null;
}

test("a repeat request keeps exactly ONE row for the address", async () => {
  const email = `once.${RUN}@example.com`;
  const first = await captureOtp(() => requestRegistrationOtp(details(email)));
  const second = await captureOtp(() => requestRegistrationOtp(details(email)));
  assert.ok(first && second);
  assert.notEqual(first, second, "each request mints a fresh code");

  const sql = await getSql();
  const rows = await sql`select id, code_hash from registration_otps where lower(email) = ${email}`;
  assert.equal(rows.length, 1, "the database holds one row for the address");
  assert.equal(rows[0].code_hash, sha256(second), "…holding the newest code");
});

test("the replaced code stops working, the new one verifies", async () => {
  const email = `once.verify.${RUN}@example.com`;
  const first = await captureOtp(() => requestRegistrationOtp(details(email)));
  const second = await captureOtp(() => requestRegistrationOtp(details(email)));

  // The superseded code must not still open the account.
  await assert.rejects(
    () => verifyRegistrationOtp(email, first),
    /Incorrect code/,
    "the superseded code is refused",
  );

  const result = await verifyRegistrationOtp(email, second);
  assert.match(result.message, /Account created/);

  const sql = await getSql();
  const rows = await sql`select verified_at, account_type from registration_otps where lower(email) = ${email}`;
  assert.equal(rows.length, 1);
  assert.ok(rows[0].verified_at, "the single row is marked verified");
  assert.equal(rows[0].account_type, "CUSTOMER");
  const [profile] = await sql`select role, account_type, account_type_selected from user_profiles where user_id = ${result.userId}`;
  assert.deepEqual(profile, { role: "USER", account_type: "CUSTOMER", account_type_selected: true });
});

test("vendor intent survives OTP verification without granting the vendor role", async () => {
  const email = `once.vendor.${RUN}@example.com`;
  const code = await captureOtp(() => requestRegistrationOtp({ ...details(email), accountType: "VENDOR" }));
  assert.ok(code);

  const result = await verifyRegistrationOtp(email, code);
  const sql = await getSql();
  const [pending] = await sql`select account_type from registration_otps where lower(email) = ${email}`;
  const [profile] = await sql`select role, account_type, account_type_selected from user_profiles where user_id = ${result.userId}`;
  assert.equal(pending.account_type, "VENDOR");
  assert.deepEqual(profile, { role: "USER", account_type: "VENDOR", account_type_selected: true });

  await submitVendorApplication(result.userId, {
    businessName: "Email Once Shop", contactPhone: "+911234567890", category: "Stationery",
    addressLine: "1 Test Road", city: "Test City", state: "Test State", pincode: "123456",
  });
  const [stillUser] = await sql`select role from user_profiles where user_id = ${result.userId}`;
  assert.equal(stillUser.role, "USER", "only Admin review grants vendor access");
});

test("casing does not create a second entry", async () => {
  const email = `once.case.${RUN}@example.com`;
  await captureOtp(() => requestRegistrationOtp(details(email)));
  await captureOtp(() => requestRegistrationOtp(details(email.replace("once", "Once").replace("example", "Example"))));

  const sql = await getSql();
  const rows = await sql`
    select id from registration_otps where lower(email) = ${email.toLowerCase()}
  `;
  assert.equal(rows.length, 1, "Email@x.com and email@x.com are the same person");
});

test("the same email cannot become two accounts, even in a different case", async () => {
  const email = `once.dup.${RUN}@example.com`;
  await insertCredentialUser({
    email,
    name: "Email Once",
    passwordHash: "not-a-real-hash",
    emailVerified: true,
  });

  await assert.rejects(
    () =>
      insertCredentialUser({
        email: email.toUpperCase(),
        name: "Email Once",
        passwordHash: "not-a-real-hash",
        emailVerified: true,
      }),
    (err) => err.status === 409 && err.code === "EMAIL_TAKEN",
    "a second signup for the same address is refused",
  );

  const sql = await getSql();
  const rows = await sql`select id from "user" where lower(email) = ${email}`;
  assert.equal(rows.length, 1, "still exactly one account");
});

import assert from "node:assert/strict";
import { test } from "node:test";

// Explicitly isolate this batch from any DATABASE_URL in .env and never send
// verification codes to real mail providers.
Object.assign(process.env, {
  DATABASE_URL: " ",
  VITE_AUTH_ENABLED: "true",
  MAIL_SERVER: "",
  BREVO_API_KEY: "",
});

const { requestRegistrationOtp, verifyRegistrationOtp } = await import(
  "../src/lib/server/registration-otp.ts"
);
const { auth } = await import("../src/lib/auth/server.ts");
const { getSql } = await import("../src/lib/db.ts");

const sql = await getSql();
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const PASSWORD = "PrinthubPass123!";
const LOCAL_HEADERS = new Headers({ origin: "http://localhost:8080" });

async function requestAndCaptureOtp(input) {
  const lines = [];
  const originalInfo = console.info;
  console.info = (...args) => lines.push(args.map(String).join(" "));
  try {
    await requestRegistrationOtp(input);
    // Mail is fire-and-forget; let the logged no-op finish before restoring.
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    console.info = originalInfo;
  }
  const code = lines.join("\n").match(/verification code is:\s*(\d{6})/)?.[1];
  assert.ok(code, `test OTP should be captured for ${input.email}`);
  return code;
}

test("15 synthetic users can register and sign in from the configured localhost origin", async () => {
  const createdEmails = [];
  const createdUserIds = [];
  try {
    for (let index = 1; index <= 15; index += 1) {
      const email = `registration-login.${RUN}.${index}@example.com`;
      createdEmails.push(email);
      const accountType = index % 2 === 0 ? "VENDOR" : "CUSTOMER";
      const registration = {
        firstName: `Test${index}`,
        lastName: "PrintHub",
        email,
        password: PASSWORD,
        accountType,
      };

      const code = await requestAndCaptureOtp(registration);
      const created = await verifyRegistrationOtp(email, code);
      createdUserIds.push(created.userId);
      assert.equal(created.accountType, accountType, `registration ${index} should save its choice`);

      const profileRows = await sql`
        select role, account_type, account_type_selected
        from user_profiles where user_id = ${created.userId}
      `;
      assert.deepEqual(profileRows[0], {
        role: "USER",
        account_type: accountType,
        account_type_selected: true,
      });

      // Explicitly exercise Better Auth's origin check: localhost is accepted,
      // while an unrelated origin is refused before credentials are processed.
      const login = await auth.api.signInEmail({
        body: { email, password: PASSWORD },
        headers: LOCAL_HEADERS,
        asResponse: true,
      });
      assert.equal(login.status, 200, `localhost login should succeed for credential ${index}`);
      const loginBody = await login.json();
      assert.equal(loginBody.user.email, email);
      assert.equal(loginBody.user.id, created.userId);

      if (index === 1) {
        const untrusted = await auth.handler(new Request("http://localhost:8080/api/auth/sign-in/email", {
          method: "POST",
          headers: { origin: "https://untrusted.example", "content-type": "application/json" },
          body: JSON.stringify({ email, password: PASSWORD }),
        }));
        assert.equal(untrusted.status, 403, "an unrelated browser origin must be rejected");
        const untrustedBody = await untrusted.json();
        assert.match(JSON.stringify(untrustedBody), /invalid origin/i);
      }
    }
  } finally {
    for (const userId of createdUserIds) {
      await sql`delete from session where "userId" = ${userId}`;
      await sql`delete from "account" where "userId" = ${userId}`;
      await sql`delete from user_profiles where user_id = ${userId}`;
      await sql`delete from "user" where id = ${userId}`;
    }
    for (const email of createdEmails) {
      await sql`delete from registration_otps where lower(email) = ${email}`;
    }
  }
});

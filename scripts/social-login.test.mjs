import assert from "node:assert/strict";
import { test } from "node:test";

// Keep this integration test isolated from any configured .env database and
// provider accounts. It only asks Better Auth to construct OAuth redirects.
Object.assign(process.env, {
  DATABASE_URL: " ",
  VITE_AUTH_ENABLED: "true",
  GROK_AUTH_ISSUER: "https://oauth.test.invalid",
  GROK_AUTH_CLIENT_ID: "test-broker-client",
  GROK_AUTH_CLIENT_SECRET: "test-broker-secret",
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
});

const { auth, directGoogleConfigured, SESSION_TOKEN_COOKIE } = await import("../src/lib/auth/server.ts");
const { handleAuthPopupRequest } = await import("../src/lib/auth/popup.server.ts");
const { getSql } = await import("../src/lib/db.ts");
const {
  completeSocialRegistration,
  ensureProfile,
  getSocialRegistrationState,
  requireCustomerAccount,
  requireVendorApplicant,
} = await import("../src/lib/server/profile.ts");
const sql = await getSql();
const TEST_RUN = Math.random().toString(36).slice(2, 9);

const ORIGIN = "http://localhost:8080";
const CALLBACK = `${ORIGIN}/login?next=%2F&socialCallback=1`;
const NEW_USER_CALLBACK = `${ORIGIN}/register?next=%2F&socialCallback=1`;
const ERROR_CALLBACK = `${ORIGIN}/login?next=%2F&socialError=1`;
const HEADERS = new Headers({ origin: ORIGIN });

async function startBrokeredSignIn(providerId) {
  const response = await auth.api.signInWithOAuth2({
    body: {
      providerId,
      callbackURL: CALLBACK,
      errorCallbackURL: ERROR_CALLBACK,
      newUserCallbackURL: NEW_USER_CALLBACK,
    },
    headers: HEADERS,
    asResponse: true,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.url, "string");
  return new URL(body.url);
}

test("Google broker sign-in constructs the broker authorization redirect", async () => {
  const url = await startBrokeredSignIn("grok-google");

  assert.equal(url.origin, "https://oauth.test.invalid");
  assert.equal(url.pathname, "/api/auth/oauth2/authorize");
  assert.equal(url.searchParams.get("idp"), "google");
  assert.equal(url.searchParams.get("prompt"), "login");
  assert.equal(url.searchParams.get("client_id"), "test-broker-client");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.match(url.searchParams.get("redirect_uri"), /\/oauth2\/callback\/grok-google$/);
  assert.match(url.searchParams.get("scope"), /openid/);
  assert.ok(url.searchParams.get("state"));
});

test("X sign-in constructs the broker redirect with Better Auth's Twitter provider hint", async () => {
  const url = await startBrokeredSignIn("grok-x");

  assert.equal(url.origin, "https://oauth.test.invalid");
  assert.equal(url.pathname, "/api/auth/oauth2/authorize");
  assert.equal(url.searchParams.get("idp"), "twitter");
  assert.equal(url.searchParams.get("prompt"), "login");
  assert.equal(url.searchParams.get("client_id"), "test-broker-client");
  assert.match(url.searchParams.get("redirect_uri"), /\/oauth2\/callback\/grok-x$/);
  assert.ok(url.searchParams.get("state"));
});

test("live-preview popup completion returns the first-party session and new-user marker", async () => {
  const response = await handleAuthPopupRequest(new Request(
    "http://localhost:8080/auth/popup?done=1&newUser=1",
    { headers: { cookie: `${SESSION_TOKEN_COOKIE}=preview%3Asession-token` } },
  ));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /"token":"preview:session-token"/);
  assert.match(html, /"isNewUser":true/);
});

test("direct Google sign-in routes new users to registration and existing users to login", async () => {
  assert.equal(directGoogleConfigured, true);
  const response = await auth.api.signInSocial({
    body: {
      provider: "google",
      callbackURL: CALLBACK,
      errorCallbackURL: ERROR_CALLBACK,
      newUserCallbackURL: NEW_USER_CALLBACK,
    },
    headers: HEADERS,
    asResponse: true,
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  const url = new URL(body.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.pathname, "/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "test-google-client");
  assert.match(url.searchParams.get("redirect_uri"), /\/api\/auth\/callback\/google$/);
  assert.match(url.searchParams.get("scope"), /email/);
  assert.ok(url.searchParams.get("state"));
  assert.ok(url.searchParams.get("code_challenge"));
});

test("OAuth profile details are stored and account type controls access without granting vendor role", async () => {
  const googleId = `social_google_${TEST_RUN}`;
  const xId = `social_x_${TEST_RUN}`;
  const existingId = `social_existing_${TEST_RUN}`;

  async function createOAuthIdentity(userId, name, email, providerId) {
    await sql`
      insert into "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt")
      values (${userId}, ${name}, ${email}, true, ${`https://images.example/${userId}.png`}, now(), now())
    `;
    await sql`
      insert into "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
      values (${`${userId}_account`}, ${`${providerId}_account`}, ${providerId}, ${userId}, now(), now())
    `;
  }

  try {
    await createOAuthIdentity(googleId, "Google Customer", `${googleId}@example.com`, "grok-google");
    await createOAuthIdentity(xId, "X Vendor", `${xId}@example.com`, "grok-x");
    await createOAuthIdentity(existingId, "Existing Customer", `${existingId}@example.com`, "grok-google");
    await sql`update "account" set "createdAt" = now() - interval '30 days' where "userId" = ${existingId}`;

    const existingProfile = await ensureProfile(existingId);
    const existingState = await getSocialRegistrationState(existingId);
    assert.equal(existingProfile.accountTypeSelected, true, "an older social account keeps its saved/default access selection");
    assert.equal(existingState.needsSelection, false, "an existing social identity must not be sent to registration");

    const googleProfile = await ensureProfile(googleId);
    const googleState = await getSocialRegistrationState(googleId);
    assert.equal(googleState.needsSelection, true, "a new Google identity must choose an account type");
    assert.equal(googleProfile.firstName, "Google");
    assert.equal(googleProfile.lastName, "Customer");
    assert.equal(googleProfile.phone, null);
    const customerAccess = await completeSocialRegistration(googleId, "CUSTOMER");
    assert.deepEqual(customerAccess, { accountType: "CUSTOMER", role: "USER" });
    assert.equal((await requireCustomerAccount(googleId)).accountType, "CUSTOMER");
    await assert.rejects(() => requireVendorApplicant(googleId), /Vendor account type required/i);

    const vendorProfile = await ensureProfile(xId);
    const vendorState = await getSocialRegistrationState(xId);
    assert.equal(vendorState.needsSelection, true, "a new X identity must choose an account type");
    assert.equal(vendorProfile.firstName, "X");
    assert.equal(vendorProfile.lastName, "Vendor");
    // Once the pending choice has been persisted, a slower registrant must not
    // lose the ability to finish just because the original OAuth session aged.
    await sql`update "account" set "createdAt" = now() - interval '30 minutes' where "userId" = ${xId}`;
    const vendorAccess = await completeSocialRegistration(xId, "VENDOR");
    assert.deepEqual(vendorAccess, { accountType: "VENDOR", role: "USER" });
    assert.equal((await requireVendorApplicant(xId)).accountType, "VENDOR");
    await assert.rejects(() => requireCustomerAccount(xId), /Customer account access required/i);

    // Callback query changes cannot change an already-selected account type.
    assert.deepEqual(await completeSocialRegistration(xId, "CUSTOMER"), vendorAccess);
    assert.equal((await getSocialRegistrationState(xId)).needsSelection, false);
  } finally {
    await sql`delete from user_profiles where user_id in (${googleId}, ${xId}, ${existingId})`;
    await sql`delete from "user" where id in (${googleId}, ${xId}, ${existingId})`;
  }
});

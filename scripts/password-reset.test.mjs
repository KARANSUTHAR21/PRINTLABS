import assert from "node:assert/strict";
import test from "node:test";

/**
 * Password reset (forgot-password link) — production guarantees:
 *
 *  - the emailed link is built from a REAL public origin — a leftover
 *    `http://localhost:8080` in `FRONTEND_URL` must never be mailed to users;
 *  - only the sha256 of the token is stored, never the token itself;
 *  - issuing a new link consumes the previous one (one live link at a time);
 *  - links are single-use and expire;
 *  - the shared password policy is enforced server-side (letters + numbers);
 *  - a successful reset rewrites the password hash AND revokes every session.
 *
 * Runs against PGLite (`DATABASE_URL` blank), same as the rest of the suite.
 * Mail is forced to the logged no-op so no real email leaves the process —
 * the no-op log is also how these tests read the link the user would receive.
 */

process.env.MAIL_SERVER = "";
process.env.BREVO_API_KEY = "";

const { requestPasswordReset, resetPasswordWithToken, resolveResetBaseUrl } = await import(
  "../src/lib/server/password-reset.ts"
);
const { insertCredentialUser } = await import("../src/lib/server/credential-accounts.ts");
const { getSql } = await import("../src/lib/db.ts");
const { sha256 } = await import("../src/lib/server/crypto-utils.ts");
const { hashPassword, verifyPassword } = await import("better-auth/crypto");

const RUN = Math.random().toString(36).slice(2, 8);

async function makeUser(tag) {
  const email = `reset.${tag}.${RUN}@example.com`;
  const { userId } = await insertCredentialUser({
    email,
    name: `Reset ${tag}`,
    passwordHash: await hashPassword("OldPassw0rd!1"),
    emailVerified: true,
  });
  return { email, userId };
}

/** Run `fn` while capturing the no-op mail log, and return the reset token. */
async function captureToken(fn) {
  const lines = [];
  const original = console.info;
  console.info = (...args) => lines.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.info = original;
  }
  const match = lines.join("\n").match(/\/reset-password\/([a-f0-9]{64})/);
  return match?.[1] ?? null;
}

async function resetRow(userId) {
  const sql = await getSql();
  const rows = await sql`
    select id, token_hash, used_at::text as used_at, expires_at::text as expires_at, created_at
    from password_resets where user_id = ${userId}
    order by created_at desc
  `;
  return rows;
}

test("resolveResetBaseUrl prefers a real origin over a leftover localhost", () => {
  assert.equal(
    resolveResetBaseUrl("https://printhub.example", "http://127.0.0.1:8080"),
    "https://printhub.example",
  );
  assert.equal(resolveResetBaseUrl("https://printhub.example/", null), "https://printhub.example");
  // A `http://localhost:8080` left in a deploy's env must NOT reach users.
  assert.equal(
    resolveResetBaseUrl("http://localhost:8080", "https://shop.grok.me"),
    "https://shop.grok.me",
  );
  assert.equal(resolveResetBaseUrl(undefined, "https://shop.grok.me"), "https://shop.grok.me");
  assert.equal(resolveResetBaseUrl(undefined, null), "http://localhost:8080");
});

test("the link's token is stored only as a hash", async () => {
  const { email, userId } = await makeUser("hash");
  const token = await captureToken(() => requestPasswordReset(email));
  assert.ok(token, "a reset link was emailed");

  const [row] = await resetRow(userId);
  assert.equal(row.token_hash, sha256(token), "stored hash matches the emailed token");
  assert.notEqual(row.token_hash, token, "the raw token is never stored");
  assert.equal(row.used_at, null, "a freshly issued link is unused");
});

test("requesting a new link invalidates the previous one", async () => {
  const { email, userId } = await makeUser("rotate");
  const first = await captureToken(() => requestPasswordReset(email));
  const second = await captureToken(() => requestPasswordReset(email));
  assert.notEqual(first, second);

  const rows = await resetRow(userId);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((r) => r.used_at === null).length, 1, "exactly one live link");

  await assert.rejects(
    () => resetPasswordWithToken(first, "NewPassw0rd!1"),
    /invalid or has expired/,
    "the superseded link no longer works",
  );
  const result = await resetPasswordWithToken(second, "NewPassw0rd!1");
  assert.match(result.message, /updated/i);
});

test("a reset link can only be used once", async () => {
  const { email } = await makeUser("once");
  const token = await captureToken(() => requestPasswordReset(email));

  await resetPasswordWithToken(token, "NewPassw0rd!1");
  await assert.rejects(
    () => resetPasswordWithToken(token, "AnotherPassw0rd!2"),
    /invalid or has expired/,
  );
});

test("an expired link is rejected", async () => {
  const { email, userId } = await makeUser("expired");
  const token = await captureToken(() => requestPasswordReset(email));

  const sql = await getSql();
  await sql`
    update password_resets set expires_at = now() - interval '1 minute'
    where user_id = ${userId}
  `;

  await assert.rejects(() => resetPasswordWithToken(token, "NewPassw0rd!1"), /expired/);
});

test("the shared password policy is enforced server-side", async () => {
  const { email } = await makeUser("weak");
  const token = await captureToken(() => requestPasswordReset(email));

  await assert.rejects(() => resetPasswordWithToken(token, "Pass1"), /at least 8/);
  await assert.rejects(() => resetPasswordWithToken(token, "onlyletters"), /number/);
  await assert.rejects(() => resetPasswordWithToken(token, "12345678"), /letter/);

  // A rejected attempt must not burn the link.
  const result = await resetPasswordWithToken(token, "NewPassw0rd!1");
  assert.match(result.message, /updated/i);
});

test("a malformed token is rejected before any lookup", async () => {
  await assert.rejects(
    () => resetPasswordWithToken("not-a-real-token", "NewPassw0rd!1"),
    /invalid or has expired/,
  );
});

test("a successful reset rewrites the password and revokes every session", async () => {
  const { email, userId } = await makeUser("session");
  const sql = await getSql();

  await sql.query(
    `insert into session ("id", "token", "userId", "expiresAt", "createdAt", "updatedAt")
     values ($1, $2, $3, now() + interval '1 day', now(), now())`,
    [`ses_${RUN}`, `tok_${RUN}`, userId],
  );

  const token = await captureToken(() => requestPasswordReset(email));
  await resetPasswordWithToken(token, "NewPassw0rd!1");

  const sessions = await sql`select id from session where "userId" = ${userId}`;
  assert.equal(sessions.length, 0, "existing sessions are revoked by a password reset");

  const [account] = await sql`
    select password from "account"
    where "userId" = ${userId} and "providerId" = 'credential'
  `;
  assert.ok(account?.password, "a credential password row exists");
  assert.equal(
    await verifyPassword({ hash: account.password, password: "NewPassw0rd!1" }),
    true,
    "the new password verifies",
  );
  assert.equal(
    await verifyPassword({ hash: account.password, password: "OldPassw0rd!1" }),
    false,
    "the old password no longer works",
  );
});

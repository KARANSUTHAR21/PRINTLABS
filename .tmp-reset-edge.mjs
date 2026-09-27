const { loadEnvFile } = await import("./scripts/load-env.mjs");
loadEnvFile();
process.env.MAIL_SERVER = "";
process.env.BREVO_API_KEY = "";

const { getSql } = await import("@/lib/db");
const { requestPasswordReset, resetPasswordWithToken, checkResetToken } = await import(
  "@/lib/server/password-reset"
);
const { insertCredentialUser } = await import("@/lib/server/credential-accounts");
const { hashPassword } = await import("better-auth/crypto");
const { randomUUID } = await import("node:crypto");

const sql = await getSql();
const USED = process.argv[2];

// ---- (a) the link we already consumed must be dead ------------------------
if (USED) {
  console.log("== dead-link check ==");
  console.log("checkResetToken(used) →", JSON.stringify(await checkResetToken(USED)));
  const r = await sql`
    select used_at::text as used_at from password_resets
     where token_hash = ${(await import("@/lib/server/crypto-utils")).sha256(USED)}`;
  console.log("row used_at:", r[0]?.used_at ?? "(no row)");
}

// ---- (b) a user with NO credential password (Google-only) -----------------
console.log("\n== google-only account ==");
const email = `oauth.probe.${Date.now()}@example.com`;
const userId = randomUUID().replaceAll("-", "");
await sql`insert into "user" ("id","name","email","emailVerified","createdAt","updatedAt")
          values (${userId}, 'OAuth Probe', ${email}, true, now(), now())`;
await sql`insert into "account" ("id","accountId","providerId","userId","createdAt","updatedAt")
          values (${randomUUID().replaceAll("-", "")}, 'google-sub-123', 'google', ${userId}, now(), now())`;
await sql`insert into user_profiles (user_id, first_name, last_name, role)
          values (${userId}, 'OAuth', 'Probe', 'USER') on conflict (user_id) do nothing`;
console.log("created google-only user:", email);

const minted = [];
const realInfo = console.info;
console.info = (...a) => minted.push(a.map(String).join(" "));
try {
  await requestPasswordReset(email);
} finally {
  console.info = realInfo;
}
const token = /reset-password\/([a-f0-9]{64})/.exec(minted.join("\n"))?.[1];
console.log("link minted:", Boolean(token));

const before = await sql`select "providerId","password" from "account" where "userId" = ${userId}`;
console.log("accounts before:", before.map((a) => `${a.providerId}${a.password ? "(hash)" : "(no password)"}`).join(", "));

const res = await resetPasswordWithToken(token, "OauthResetPass1");
console.log("reset result:", JSON.stringify(res));

const after = await sql`select "providerId","password" from "account" where "userId" = ${userId}`;
console.log("accounts after :", after.map((a) => `${a.providerId}${a.password ? "(hash)" : "(no password)"}`).join(", "));

const login = await fetch("http://127.0.0.1:8080/api/auth/sign-in/email", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "http://127.0.0.1:8080" },
  body: JSON.stringify({ email, password: "OauthResetPass1" }),
});
console.log("sign-in with the NEW password →", login.status, login.status === 200 ? "✅ password persisted" : "❌ NOT persisted");
console.log("cleanup email:", email);
process.exit(0);

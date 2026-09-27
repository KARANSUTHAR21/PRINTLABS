// Loads the REAL .env, then inspects accounts + the reset mail path.
// Pass --send to actually send a reset email through the live transport.
const { loadEnvFile } = await import("./scripts/load-env.mjs");
loadEnvFile();

const { sendPasswordResetMail, mailConfigured } = await import("@/lib/server/email");
const { getSql } = await import("@/lib/db");
const { publicBaseUrl } = await import("@/lib/server/public-url");

console.log("mail configured:", mailConfigured(), "| MAIL_SERVER:", process.env.MAIL_SERVER || "(unset)");
console.log("db:", (process.env.DATABASE_URL || "").slice(0, 40) || "(unset → PGLite!)");
console.log("base URL for links:", await publicBaseUrl());

const sql = await getSql();
const users = await sql`select email, "emailVerified" from "user" order by email`;
console.log(`\naccounts (${users.length}):`);
for (const u of users) console.log("  -", u.email, u.emailVerified ? "(verified)" : "(UNVERIFIED)");

const candidate = process.argv[2];
if (candidate) {
  const rows = await sql`select id from "user" where lower(email) = ${candidate.toLowerCase()}`;
  console.log(`\n"${candidate}" →`, rows.length ? "account exists ✅" : "NO ACCOUNT ❌ (forgot-password sends nothing)");
}

if (process.argv.includes("--send")) {
  const { requestPasswordReset } = await import("@/lib/server/password-reset");
  const target = candidate;
  console.log(`\n--- sending a real reset link to ${target} ---`);
  const res = await requestPasswordReset(target);
  console.log("result:", JSON.stringify(res));
  const rows = await sql`
    select email, expires_at, used_at
      from password_resets
     where lower(email) = ${String(target).toLowerCase()}
     order by created_at desc limit 1`;
  console.log("row:", JSON.stringify(rows[0] ?? null));
}
process.exit(0);

// Uses the REAL transport from .env — this sends a genuine email.
const { requestPasswordReset } = await import("@/lib/server/password-reset");
const { getSql } = await import("@/lib/db");
const { mailConfigured } = await import("@/lib/server/email");

const email = process.argv[2];
if (!email) {
  console.error("usage: node ... <email>");
  process.exit(2);
}

console.log("mail configured:", mailConfigured());
console.log("MAIL_SERVER:", process.env.MAIL_SERVER || "(unset)");
console.log("MAIL_USER:", process.env.MAIL_USER || "(unset)");
console.log("MAIL_FROM:", process.env.MAIL_FROM || "(unset)");

const sql = await getSql();
const users = await sql`select id, email from "user" where lower(email) = ${email.toLowerCase()}`;
console.log("account exists:", users.length > 0);

const result = await requestPasswordReset(email);
console.log("response:", JSON.stringify(result));

// The send is fire-and-forget — give it a moment to land and be logged.
await new Promise((r) => setTimeout(r, 8000));

const rows = await sql`
  select email, expires_at, used_at,
         extract(epoch from (expires_at - now()))::int as secs_left
  from password_resets order by created_at desc limit 3
`;
console.log("password_resets rows:", rows);
process.exit(0);

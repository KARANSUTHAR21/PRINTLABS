import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { newId, randomToken, sha256 } from "./crypto-utils";
import { fail } from "./errors";
import { rateLimit } from "./rate-limit";

const GENERIC =
  "If an account exists for this email, a reset link has been sent.";

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!rateLimit(`forgot:${normalized}`, 5, 15 * 60_000)) {
    fail("Too many reset requests. Try again later.", 429);
  }
  const sql = await getSql();
  const users = await sql<{ id: string; email: string }>`
    select id, email from "user" where lower(email) = ${normalized} limit 1
  `;
  if (users[0]) {
    const token = randomToken(32);
    const tokenHash = sha256(token);
    const expires = new Date(Date.now() + 30 * 60_000).toISOString();
    await sql`
      insert into password_resets (id, user_id, email, token_hash, expires_at)
      values (${newId("rst")}, ${users[0].id}, ${normalized}, ${tokenHash}, ${expires})
    `;
    const base = env("FRONTEND_URL") || "";
    const link = `${base}/reset-password/${token}`;
    await sendResetMail(normalized, link);
  }
  return { message: GENERIC };
}

async function sendResetMail(to: string, link: string) {
  const host = env("MAIL_SERVER");
  if (!host) {
    console.info("[printhub] password reset (email not configured)", to, link);
    return;
  }
  console.info("[printhub] would send reset mail via SMTP", host, to);
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  if (newPassword.length < 8) fail("Password must be at least 8 characters.", 422);
  if (!rateLimit(`reset:${token.slice(0, 8)}`, 8, 15 * 60_000)) {
    fail("Too many reset attempts. Try again later.", 429);
  }
  const sql = await getSql();
  const tokenHash = sha256(token);
  const rows = await sql<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>`
    select id, user_id, expires_at::text as expires_at, used_at::text as used_at
    from password_resets where token_hash = ${tokenHash} limit 1
  `;
  const row = rows[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    fail("Your reset link has expired.", 400, "EXPIRED");
  }
  const { auth } = await import("@/lib/auth/server");
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(newPassword);
  await ctx.internalAdapter.updatePassword(row.user_id, hash);
  await sql`update password_resets set used_at = now() where id = ${row.id}`;
  return { message: "Password updated. You can sign in now." };
}

/**
 * Password reset — "forgot password" link flow.
 *
 * Two steps, both deliberately enumeration-safe:
 *
 *  1. `requestPasswordReset(email)` — always answers with the same generic
 *     message. Only when an account exists do we mint a single-use token and
 *     email a link. Issuing a new link CONSUMES any previous unused link, so a
 *     user reading an older email can never be confused by a dead code.
 *  2. `resetPasswordWithToken(token, password)` — validates the token, applies
 *     the shared password policy, revokes every existing session, and burns all
 *     of the account's reset tokens.
 *
 * Security notes:
 *  - Only the sha256 of the token is stored; the raw value lives in the email.
 *  - 30-minute expiry, single use, and a strict 64-hex shape check before any
 *    database lookup.
 *  - Sessions are deleted on success: a reset is exactly the moment you want a
 *    stolen session to stop working.
 *  - The emailed link is built from the request's own origin whenever
 *    `FRONTEND_URL` is unset or still pointing at localhost, so a deployment
 *    that forgets to configure it still sends a working link.
 */
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { passwordProblem } from "@/lib/password";
import { newId, randomToken, sha256 } from "./crypto-utils";
import { sendPasswordResetMail } from "./email";
import { fail } from "./errors";
import { rateLimit } from "./rate-limit";

/** Never discloses whether the address belongs to an account. */
const GENERIC = "If an account exists for this email, a reset link has been sent.";

/** How long a reset link stays valid. */
export const RESET_TTL_MS = 30 * 60_000;

/** `randomToken(32)` → 64 lowercase hex characters. */
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/** Loopback origins are a development convenience, never a production link. */
function isLoopbackOrigin(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * Base URL for the emailed link.
 *
 * A configured `FRONTEND_URL` wins, but only when it is a real (non-loopback)
 * URL — a leftover `http://localhost:8080` must not be mailed to production
 * users. When it is missing or loopback we use the origin the request actually
 * arrived on, and only fall back to localhost when there is no request at all
 * (node:test, background jobs).
 */
export function resolveResetBaseUrl(
  configured: string | undefined,
  origin: string | null,
): string {
  const trimmed = configured?.trim().replace(/\/+$/, "") ?? "";
  if (trimmed && !isLoopbackOrigin(trimmed)) return trimmed;
  if (origin) return origin.replace(/\/+$/, "");
  return trimmed || "http://localhost:8080";
}

/**
 * Origin of the current request. Dynamically imported so this module (which the
 * client-adjacent `api/public.ts` imports) never statically pulls
 * `@tanstack/react-start/server` into a browser bundle.
 */
async function currentOrigin(): Promise<string | null> {
  try {
    const { requestOrigin } = await import("./request-origin.server");
    return requestOrigin();
  } catch {
    return null;
  }
}

/** Step 1 — mint a link and email it (or pretend to). */
export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!(await rateLimit(`forgot:${normalized}`, 5, 15 * 60_000))) {
    fail("Too many reset requests. Try again later.", 429);
  }
  const sql = await getSql();
  const users = await sql<{ id: string; email: string }>`
    select id, email from "user" where lower(email) = ${normalized} limit 1
  `;
  if (users[0]) {
    const token = randomToken(32);
    const tokenHash = sha256(token);
    const expires = new Date(Date.now() + RESET_TTL_MS).toISOString();

    // Consume any earlier link FIRST, so the row we are about to insert is the
    // only live one ("resend" replaces the link instead of stacking a second).
    await sql`
      update password_resets set used_at = now()
      where user_id = ${users[0].id} and used_at is null
    `;

    await sql`
      insert into password_resets (id, user_id, email, token_hash, expires_at)
      values (${newId("rst")}, ${users[0].id}, ${normalized}, ${tokenHash}, ${expires})
    `;

    const base = resolveResetBaseUrl(env("FRONTEND_URL"), await currentOrigin());
    const link = `${base}/reset-password/${token}`;
    // Fire-and-forget: a mail outage must not turn into a user enumeration
    // oracle or slow the response (spec §75 — failures never fail the flow).
    void sendPasswordResetMail(normalized, link);
  }
  return { message: GENERIC };
}

/**
 * Non-destructive "is this link still usable?" check.
 *
 * Used by the reset page on mount so someone following an expired or already
 * used link is told immediately, instead of typing a new password only to be
 * refused. Never consumes the token.
 */
export async function checkResetToken(token: string): Promise<{ valid: boolean }> {
  const trimmed = token.trim();
  if (!TOKEN_PATTERN.test(trimmed)) return { valid: false };
  const sql = await getSql();
  const rows = await sql<{ expires_at: string; used_at: string | null }>`
    select expires_at::text as expires_at, used_at::text as used_at
    from password_resets where token_hash = ${sha256(trimmed)} limit 1
  `;
  const row = rows[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return { valid: false };
  }
  return { valid: true };
}

/** Step 2 — consume the token and set the new password. */
export async function resetPasswordWithToken(token: string, newPassword: string) {
  const problem = passwordProblem(newPassword);
  if (problem) fail(problem, 422, "WEAK_PASSWORD");

  const trimmedToken = token.trim();
  // Shape check before touching the database; the message stays vague so a
  // malformed link is indistinguishable from a stale one.
  if (!TOKEN_PATTERN.test(trimmedToken)) {
    fail("This reset link is invalid or has expired.", 400, "EXPIRED");
  }

  if (!(await rateLimit(`reset:${trimmedToken.slice(0, 8)}`, 8, 15 * 60_000))) {
    fail("Too many reset attempts. Try again later.", 429);
  }

  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>`
    select id, user_id, expires_at::text as expires_at, used_at::text as used_at
    from password_resets where token_hash = ${sha256(trimmedToken)} limit 1
  `;
  const row = rows[0];
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    fail("This reset link is invalid or has expired.", 400, "EXPIRED");
  }

  const { auth } = await import("@/lib/auth/server");
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(newPassword);
  await ctx.internalAdapter.updatePassword(row.user_id, hash);

  // A password reset invalidates every existing session — the whole point is
  // that anyone else holding a session loses it.
  await sql`delete from session where "userId" = ${row.user_id}`;

  // Burn every outstanding reset link for this account (not just this one).
  await sql`
    update password_resets set used_at = now()
    where user_id = ${row.user_id} and used_at is null
  `;

  return { message: "Your password has been updated. Sign in with your new password." };
}

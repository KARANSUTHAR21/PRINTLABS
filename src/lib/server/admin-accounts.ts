import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { passwordProblem } from "@/lib/password";
import { audit } from "./audit";
import { fail } from "./errors";
import { withLock } from "./locks";

const ADMIN_MEMBERSHIP_LOCK = "admin-membership:v1";
const ADMIN_MEMBERSHIP_LOCK_TIMEOUT_MS = 10_000;
type ManagedRole = "USER" | "ADMIN" | "DELIVERY_PARTNER";

async function requireAdmin(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const [profile] = await sql<{ role: string }>`
    select role from user_profiles where user_id = ${userId} limit 1
  `;
  if (profile?.role !== "ADMIN") fail("Admin access required.", 403, "FORBIDDEN");
}

export async function createAdminLogin(
  actorId: string,
  input: { email: string; name: string; password: string },
): Promise<{ userId: string; email: string }> {
  const passwordError = passwordProblem(input.password);
  if (passwordError) fail(passwordError, 422, "INVALID_PASSWORD");

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const passwordHash = await hashPassword(input.password);
  return withLock(ADMIN_MEMBERSHIP_LOCK, ADMIN_MEMBERSHIP_LOCK_TIMEOUT_MS, async () => {
    const sql = await getSql();
    await requireAdmin(sql, actorId);
    const [admins] = await sql<{ count: number }>`
      select count(*)::int as count from user_profiles where role = 'ADMIN'
    `;
    if (!admins || admins.count < 1) {
      fail("An Admin account is required to create another Admin login.", 409, "LAST_ADMIN_REQUIRED");
    }

    const userId = randomUUID().replaceAll("-", "");
    const accountId = randomUUID().replaceAll("-", "");
    const nameParts = name.split(/\s+/);
    try {
      const created = await sql<{ user_id: string }>`
        with new_user as (
          insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
          values (${userId}, ${name}, ${email}, true, now(), now())
          returning id
        ), new_account as (
          insert into "account"
            ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
          select ${accountId}, id, 'credential', id, ${passwordHash}, now(), now() from new_user
          returning "userId"
        )
        insert into user_profiles (user_id, first_name, last_name, role)
        select u.id, ${nameParts[0] ?? name}, ${nameParts.slice(1).join(" ")}, 'ADMIN'
        from new_user u join new_account a on a."userId" = u.id
        returning user_id
      `;
      if (!created[0]) fail("Could not create the Admin login.", 500);
    } catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505") {
        fail("An account with this email already exists.", 409, "EMAIL_TAKEN");
      }
      throw cause;
    }

    await audit(sql, {
      eventType: "admin_login_created",
      userId: actorId,
      metadata: { targetUser: userId, email },
    });
    return { userId, email };
  });
}

/** Change an account role while guaranteeing at least one Admin remains. */
export async function changeUserRole(
  actorId: string,
  targetId: string,
  role: ManagedRole,
): Promise<void> {
  await withLock(ADMIN_MEMBERSHIP_LOCK, ADMIN_MEMBERSHIP_LOCK_TIMEOUT_MS, async () => {
    const sql = await getSql();
    await requireAdmin(sql, actorId);
    const [target] = await sql<{ id: string; role: string }>`
      select u.id, coalesce(p.role, 'USER') as role
      from "user" u left join user_profiles p on p.user_id = u.id
      where u.id = ${targetId} limit 1
    `;
    if (!target) fail("User not found.", 404);
    if (target.role === "VENDOR") {
      fail("Vendor access can only be changed through the vendor application workflow.", 409, "VENDOR_ROLE_PROTECTED");
    }
    if (target.role === "ADMIN" && role !== "ADMIN") {
      const [admins] = await sql<{ count: number }>`
        select count(*)::int as count from user_profiles where role = 'ADMIN'
      `;
      if (!admins || admins.count <= 1) {
        fail("The last Admin login cannot be removed. Create another Admin first.", 409, "LAST_ADMIN_REQUIRED");
      }
    }

    await sql`
      insert into user_profiles (user_id, role) values (${targetId}, ${role})
      on conflict (user_id) do update set role = ${role}, updated_at = now()
    `;
    await audit(sql, {
      eventType: "admin_user_role",
      userId: actorId,
      metadata: { targetUser: targetId, role },
    });
  });
}

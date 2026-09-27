/**
 * Dev/test seed — guarantees the documented test login exists on PGLite.
 *
 * The local fallback database is in-memory (on-disk only when `PGLITE_DATA_DIR`
 * is set), so every dev-server restart erases accounts and the documented test
 * credentials start failing with "Invalid email or password" until someone
 * re-registers. This module re-creates the tester account on boot by inserting
 * the exact rows Better Auth's email/password signup produces, using Better
 * Auth's own `hashPassword` so the stored hash format is always canonical.
 *
 * Rules:
 *  - PGLite only — a real Postgres (`DATABASE_URL`) is never touched.
 *  - Idempotent: an existing credential account is left completely alone.
 *  - Failures log loudly but never block the server from starting.
 *  - Skipped entirely when auth is off (`VITE_AUTH_ENABLED=false`).
 *
 * Env knobs (see `.env.example`):
 *  - `DEV_SEED_ADMIN=1`     → also create an ADMIN-role account
 *  - `DEV_SEED_ADMIN_EMAIL` → its email (default `admin.tester@example.com`)
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getPglite } from "../db";

const TEST_EMAIL = "razor.tester+1@example.com";
const TEST_PASSWORD = "Passw0rd!23";
const TEST_NAME = "Razor Tester";

/** Better Auth credential account rows, exactly as its signup path writes them. */
async function ensureAccount(
  pg: import("@electric-sql/pglite").PGlite,
  email: string,
  name: string,
  password: string,
  role: "USER" | "ADMIN",
): Promise<void> {
  const exists = await pg.query<{ count: number }>(
    `select count(*)::int as count
       from "account" a join "user" u on u."id" = a."userId"
      where lower(u."email") = lower($1) and a."providerId" = 'credential'`,
    [email],
  );
  if ((exists.rows[0]?.count ?? 0) > 0) return;

  const passwordHash = await hashPassword(password);
  const userId = randomUUID().replaceAll("-", "");

  // PGLite supports interactive transactions; the three inserts are one unit so
  // a crash can never leave a user without its credential account.
  await pg.transaction(async (tx) => {
    await tx.query(
      `insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, true, now(), now())`,
      [userId, name, email],
    );
    await tx.query(
      `insert into "account"
         ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
       values ($1, $2, 'credential', $3, $4, now(), now())`,
      [randomUUID().replaceAll("-", ""), userId, userId, passwordHash],
    );
    await tx.query(
      `insert into user_profiles (user_id, first_name, last_name, role)
       values ($1, $2, $3, $4)
       on conflict (user_id) do nothing`,
      [userId, name.split(" ")[0] ?? name, name.split(" ").slice(1).join(" "), role],
    );
  });
  console.log(`[dev-seed] created ${role} account ${email} (password from DEV_SEED defaults)`);
}

/**
 * Create (or verify) the seeded accounts. Called once per PGLite boot, after
 * migrations, BEFORE the dev server accepts traffic (vite `configureServer`).
 */
export async function seedDevAccounts(): Promise<void> {
  if (process.env.VITE_AUTH_ENABLED === "false") return;
  const pg = await getPglite(); // throws on the Neon path — dev seed stays dev-only
  await pg.query("select 1"); // ensure migrations ran (getSql bootstrap completed)

  await ensureAccount(pg, TEST_EMAIL, TEST_NAME, TEST_PASSWORD, "USER");

  if (process.env.DEV_SEED_ADMIN === "1") {
    await ensureAccount(
      pg,
      process.env.DEV_SEED_ADMIN_EMAIL ?? "admin.tester@example.com",
      "PrintHub Admin",
      TEST_PASSWORD,
      "ADMIN",
    );
  }
}

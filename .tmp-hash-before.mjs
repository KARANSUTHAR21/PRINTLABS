const { loadEnvFile } = await import("./scripts/load-env.mjs");
loadEnvFile();
const { getSql } = await import("@/lib/db");
const sql = await getSql();
const email = process.argv[2];
const rows = await sql`
  select a."password" as hash, u.id as uid
    from "account" a join "user" u on u.id = a."userId"
   where lower(u.email) = ${email} and a."providerId" = 'credential'`;
const r = rows[0];
console.log("BEFORE hash:", String(r.hash).slice(0, 32), "len", String(r.hash).length);
const s = await sql`
  select count(*)::int as n from session where "userId" = ${r.uid}`;
console.log("BEFORE sessions:", s[0].n);
process.exit(0);

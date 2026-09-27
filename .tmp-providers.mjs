const { loadEnvFile } = await import("./scripts/load-env.mjs");
loadEnvFile();
const { getSql } = await import("@/lib/db");
const sql = await getSql();

const rows = await sql`
  select u.email, a."providerId", (a."password" is not null) as has_pw
    from "user" u left join "account" a on a."userId" = u."id"
   order by u.email, a."providerId"`;
console.log("user → providers (/hash):");
for (const r of rows) console.log(`  ${r.email}  →  ${r.providerId}${r.has_pw ? " (password)" : ""}`);

const dups = await sql`
  select "userId", count(*)::int as n from "account"
   where "providerId" = 'credential' group by "userId" having count(*) > 1`;
console.log("\nduplicate credential rows:", dups.length);

const multi = await sql`
  select count(*)::int as n from "account" a
   where a."providerId" = 'credential'
     and (select count(*) from "account" b where b."userId" = a."userId") > 1`;
console.log("users with credential + social:", multi[0].n);
process.exit(0);

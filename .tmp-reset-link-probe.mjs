// Throwaway account + a REAL reset link (minted with the logged no-op transport
// so the raw token can be read). Proves whether the emailed link actually works.
const { loadEnvFile } = await import("./scripts/load-env.mjs");
loadEnvFile();
process.env.MAIL_SERVER = ""; // no-op: capture the link instead of mailing it
process.env.BREVO_API_KEY = "";

const { insertCredentialUser } = await import("@/lib/server/credential-accounts");
const { requestPasswordReset, resetPasswordWithToken, checkResetToken } = await import(
  "@/lib/server/password-reset"
);
const { getSql } = await import("@/lib/db");
const { hashPassword } = await import("better-auth/crypto");

const stamp = Date.now();
const email = `reset.probe.${stamp}@example.com`;
const OLD = "OldPassw0rd!23";
const NEW = "BrandNewPassw0rd!23";

await insertCredentialUser({
  email,
  name: "Reset Probe",
  passwordHash: await hashPassword(OLD),
  emailVerified: true,
});
console.log("created throwaway user:", email);

// Capture the link the mail layer would send.
const lines = [];
const realInfo = console.info;
console.info = (...a) => lines.push(a.map(String).join(" "));
try {
  await requestPasswordReset(email);
} finally {
  console.info = realInfo;
}
const link = /https?:\/\/\S*\/reset-password\/[a-f0-9]{64}/.exec(lines.join("\n"))?.[0];
console.log("emailed link:", link);

const token = link?.split("/").pop();
console.log("token shape ok:", /^[a-f0-9]{64}$/.test(String(token)));

const sql = await getSql();
const row = (
  await sql`select expires_at::text as expires_at, used_at from password_resets where lower(email) = ${email}`
)[0];
const [{ now }] = await sql`select now()::text as now`;
const minutes = (new Date(row.expires_at) - new Date(now)) / 60000;
console.log(`window: ${minutes.toFixed(2)} minutes  (now=${now} expires=${row.expires_at})`);
console.log("link valid on arrival:", (await checkResetToken(String(token))).valid);

// The reset page does this on mount — must be true BEFORE the user types.
console.log("\n--- browser test target ---");
console.log(link);
console.log("email:", email);
console.log("new password to set:", NEW);
console.log("old password (must stop working):", OLD);
process.exit(0);

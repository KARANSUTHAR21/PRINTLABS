// Usage: node ... .tmp-mint.mjs <email>  → prints a fresh reset link
const { loadEnvFile } = await import("./scripts/load-env.mjs");
loadEnvFile();
process.env.MAIL_SERVER = "";
process.env.BREVO_API_KEY = "";

const { requestPasswordReset } = await import("@/lib/server/password-reset");
const email = process.argv[2];
const lines = [];
const realInfo = console.info;
console.info = (...a) => lines.push(a.map(String).join(" "));
try {
  await requestPasswordReset(email);
} finally {
  console.info = realInfo;
}
const link = /https?:\/\/\S*\/reset-password\/[a-f0-9]{64}/.exec(lines.join("\n"))?.[0];
console.log(link ?? "NO LINK MINTED");
process.exit(0);

#!/usr/bin/env node
/**
 * Zero-dependency `.env` loader — the single place env files are read.
 *
 * `.env` is THE store for every external credential (Razorpay, SMTP, Better
 * Auth secret, DATABASE_URL…). It is loaded automatically by:
 *
 *   - scripts/with-app-env.mjs   → `npm run dev` / `build` / `preview`
 *   - scripts/migrate.mjs        → `npm run db:migrate` (build's second half)
 *   - scripts/test-register.mjs  → `npm test`
 *
 * Precedence: real `process.env` ALWAYS wins over `.env` values, so an
 * explicit override (CI secrets, deploy platform, shell) still works, and a
 * value left empty in `.env` never clobbers one injected by the platform.
 *
 * CLI usage (anything that doesn't route through the wrappers):
 *   node scripts/load-env.mjs <command> [args…]
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ENV_REL_PATH = ".env";

/** The workspace root (this file lives in `<root>/scripts/`). */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Parse `.env`-style text: `KEY=VALUE` lines, `#` comments, optional
 * `export ` prefix, single/double-quoted values, inline ` # comment`.
 * Malformed lines are skipped silently — a typo must not take the app down.
 */
export function parseEnvText(text) {
  const out = {};
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const withoutExport = line.replace(/^export\s+/, "");
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = withoutExport.slice(eq + 1).trim();
    const quote = value[0];
    if (
      (quote === `"` || quote === `'`) &&
      value.length >= 2 &&
      value.endsWith(quote)
    ) {
      value = value.slice(1, -1);
    } else {
      const comment = value.indexOf(" #");
      if (comment !== -1) value = value.slice(0, comment).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * Read `<root>/.env` (default: the workspace root) into `process.env`.
 * Existing env entries always win; nothing is ever overwritten. Returns the
 * parsed map so callers can report what was loaded.
 */
export function loadEnvFile(root = projectRoot()) {
  const path = join(root, ENV_REL_PATH);
  if (!existsSync(path)) return {};
  let parsed;
  try {
    parsed = parseEnvText(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
  return parsed;
}

/**
 * Translate a child's `exit` `(code, signal)` into this process's exit status
 * (`128 + signo` for signals — do not re-raise; see with-app-env.mjs).
 */
export function exitStatusFromChild(code, signal) {
  if (signal) return 128 + 1;
  return code ?? 1;
}

/** Whether this file is the script node was asked to run (symlink-safe). */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return existsSync(entry) && realpathSync(entry) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("usage: node scripts/load-env.mjs <command> [args…]");
    process.exit(2);
  }
  loadEnvFile();
  const child = spawn(command, args, { stdio: "inherit", shell: true });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (err) => {
    console.error(`[load-env] failed to run ${command}:`, err?.message || err);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.exit(exitStatusFromChild(code, signal));
  });
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}

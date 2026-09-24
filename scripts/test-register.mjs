/**
 * Bootstrap for node tests that import app TypeScript with `@/` aliases:
 *
 *   node --experimental-strip-types --import ./scripts/test-register.mjs --test <files>
 *
 * Registers the alias loader inside a dedicated worker and points it at the
 * project root (the loader worker does not inherit a meaningful cwd).
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { loadEnvFile } from "./load-env.mjs";

process.env.PRINTHUB_ROOT = process.cwd();
loadEnvFile();
register("./scripts/ts-alias-loader.mjs", pathToFileURL("./"));

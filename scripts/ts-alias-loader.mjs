/**
 * Node loader hook that resolves the app's `@/` TypeScript path alias so
 * `node --test` can import server modules directly (no bundler needed).
 *
 * Usage:
 *   node --experimental-strip-types --experimental-loader ./scripts/ts-alias-loader.mjs --test <file>
 *
 * Runs in a dedicated loader worker; use `process.env.PRINTHUB_ROOT` (set by
 * the `--import` bootstrap below) rather than cwd for the project root.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.PRINTHUB_ROOT || process.cwd();

async function tryNext(resolveFn, href, context) {
  try {
    return await resolveFn(href, context);
  } catch (err) {
    if (process.env.PRINTHUB_LOADER_DEBUG) console.error("[alias-loader]", href, err?.message);
    return null;
  }
}

export async function resolve(specifier, context, nextResolve) {
  const candidates = [];
  if (specifier.startsWith("@/")) {
    const target = path.join(ROOT, "src", specifier.slice(2));
    candidates.push(target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts"));
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !path.extname(specifier) &&
    context.parentURL?.startsWith("file://")
  ) {
    // Extensionless relative import inside the TS sources — try TS candidates.
    const parentPath = fileURLToPath(context.parentURL).split("?")[0];
    const target = path.resolve(path.dirname(parentPath), specifier);
    candidates.push(`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts"));
  }
  if (candidates.length > 0) {
    for (const candidate of candidates) {
      const resolved = await tryNext(nextResolve, pathToFileURL(candidate).href, context);
      if (resolved) return resolved;
    }
  }
  return nextResolve(specifier, context);
}

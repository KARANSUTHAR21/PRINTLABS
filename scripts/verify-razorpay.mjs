#!/usr/bin/env node
/**
 * Razorpay live-path verification (roadmap Phase 2).
 *
 *   npm run verify:razorpay
 *
 * Proves three things against the REAL provider, not the sandbox fallback:
 *
 *   1. `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are present and authenticate
 *      (Orders API returns 200 instead of 401).
 *   2. `createProviderOrder` reaches the Orders API and returns a provider
 *      order that is NOT flagged `sandbox`.
 *   3. The amount cross-check fires: the provider echoes the exact paise we
 *      asked for (a mismatch throws in `provider.ts`, so reaching the report
 *      at the end means the guard passed).
 *
 * Test-mode orders are free and never touch money, but they cannot be
 * deleted, so the script asks for confirmation from a real terminal and
 * refuses outright when the paired key is a LIVE key unless `--allow-live`
 * is passed.
 *
 * Run it with the same bootstrap as the tests:
 *   node --experimental-strip-types --import ./scripts/test-register.mjs \
 *     scripts/verify-razorpay.mjs
 */
import { createInterface } from "node:readline/promises";
import process from "node:process";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

const args = new Set(process.argv.slice(2));
const assumeYes = args.has("--yes") || args.has("-y");
const allowLive = args.has("--allow-live");
const amountPaise = 100; // ₹1.00 — the roadmap's smoke amount.

const { createProviderOrder, isLiveRazorpay, publicKeyId } = await import(
  "../src/lib/server/provider.ts"
);

function line(msg = "") {
  process.stdout.write(`${msg}\n`);
}

function fail(msg) {
  line(`FAIL  ${msg}`);
  process.exit(1);
}

line("PrintHub — Razorpay provider verification");
line("");

if (!isLiveRazorpay()) {
  fail(
    "No provider keys configured: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are empty in .env.\n" +
      "      The app would silently fall back to the built-in sandbox provider.",
  );
}

const keyId = publicKeyId();
const live = !keyId.startsWith("rzp_test_");
line(`  mode      ${live ? "LIVE (real money)" : "test"}`);
line(`  key id    ${keyId}`);
line(`  amount    ${amountPaise} paise`);
line("");

if (live && !allowLive) {
  fail(
    "The configured key is a LIVE key. Re-run with --allow-live if you really\n" +
      "      want to create a live-mode provider order.",
  );
}

if (!assumeYes && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Create a real ${live ? "LIVE" : "test-mode"} Razorpay order for ${amountPaise} paise? [y/N] `,
  );
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    line("Aborted — nothing was created.");
    process.exit(0);
  }
}

const receipt = `verify_${Date.now()}`;
let order;
try {
  order = await createProviderOrder({
    amountPaise,
    currency: "INR",
    receipt,
  });
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

if (order.sandbox) {
  fail("createProviderOrder took the sandbox branch even though keys are set.");
}
if (order.amountPaise !== amountPaise) {
  fail(`Provider amount mismatch: asked ${amountPaise}, got ${order.amountPaise}.`);
}
if (!order.id || !order.id.startsWith("order_")) {
  fail(`Provider returned an unexpected order id: ${order.id}`);
}

line("OK    Orders API reachable with the configured keys.");
line("OK    createProviderOrder returned a real provider order.");
line(`OK    amount cross-check passed (${order.amountPaise} paise, ${order.currency}).`);
line("");
line(`  provider order id  ${order.id}`);
line(`  receipt            ${receipt}`);
line("");
line("Next: exercise the hosted Checkout modal end to end (README → Payment testing checklist).");

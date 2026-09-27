import assert from "node:assert/strict";
import test from "node:test";

import { classifyMailLog, formatConsoleLine, watchMailLog } from "./mail-log-watch.mjs";

/**
 * The live mail check confirms a fire-and-forget send by reading the email
 * transport's log line, so that parsing must be exact: a success for a
 * DIFFERENT recipient must not be mistaken for ours, and an authentication
 * failure must never be read as a delivery.
 */

test("formatConsoleLine performs printf-style %s substitution", () => {
  assert.equal(
    formatConsoleLine(["[email] sent via SMTP to=%s id=%s", "a@b.c", "<m@x>"]),
    "[email] sent via SMTP to=a@b.c id=<m@x>",
  );
  assert.equal(formatConsoleLine(["[email] send failed:", new Error("x")]), "[email] send failed:");
});

test("classifyMailLog reads a SMTP success line for the expected recipient", () => {
  const line = formatConsoleLine([
    "[email] sent via SMTP to=%s id=%s",
    "skar34242@gmail.com",
    "<64bd@gmail.com>",
  ]);
  assert.deepEqual(classifyMailLog(line, "skar34242@gmail.com"), {
    status: "sent",
    transport: "SMTP",
    to: "skar34242@gmail.com",
    id: "<64bd@gmail.com>",
  });
});

test("classifyMailLog reads a Brevo API success line", () => {
  const line = formatConsoleLine([
    "[email] sent via Brevo API to=%s id=%s",
    "a@b.c",
    "<7f3e@smtp-relay.brevo.com>",
  ]);
  assert.equal(classifyMailLog(line, "a@b.c").status, "sent");
  assert.equal(classifyMailLog(line, "a@b.c").transport, "Brevo API");
});

test("a success for another recipient never resolves this watcher", () => {
  const line = formatConsoleLine(["[email] sent via SMTP to=%s id=%s", "someone@else.dev", "<m@x>"]);
  assert.equal(classifyMailLog(line, "to.me@example.com"), null);
});

test("classifyMailLog flags transport failures and the unconfigured no-op", () => {
  assert.equal(
    classifyMailLog("[email] send failed: Invalid login: 535 5.7.8 Authentication failed").status,
    "failed",
  );
  assert.equal(classifyMailLog("[email] Brevo API 401: {\"code\":\"unauthorized\"}").status, "failed");
  const nop = formatConsoleLine(["[email:nop] to=%s subject=%s", "a@b.c", "hi"]);
  assert.equal(classifyMailLog(nop, "a@b.c").status, "failed");
});

test("unrelated console lines are ignored", () => {
  assert.equal(classifyMailLog("[db] connected", "a@b.c"), null);
  assert.equal(classifyMailLog("", "a@b.c"), null);
});

test("watchMailLog resolves on the matching success line and restores console", async () => {
  const fake = { info: () => {}, error: () => {} };
  const originalInfo = fake.info;
  const watched = watchMailLog({ to: "a@b.c", timeoutMs: 1_000, target: fake });
  fake.info("[email] sent via SMTP to=%s id=%s", "a@b.c", "<msg@x>");
  const outcome = await watched.result;
  assert.equal(outcome.status, "sent");
  assert.equal(outcome.id, "<msg@x>");
  assert.equal(fake.info, originalInfo, "console.info hook is released");
});

test("watchMailLog reports a timeout and stop() releases the hooks", async () => {
  const fake = { info: () => {}, error: () => {} };
  const originalError = fake.error;

  const timedOut = watchMailLog({ to: "a@b.c", timeoutMs: 40, target: fake });
  assert.equal((await timedOut.result).status, "timeout");
  assert.equal(fake.error, originalError);

  const stopped = watchMailLog({ to: "a@b.c", timeoutMs: 5_000, target: fake });
  stopped.stop();
  assert.equal((await stopped.result).status, "skipped");
  assert.equal(fake.error, originalError);
});

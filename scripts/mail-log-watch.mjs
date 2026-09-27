/**
 * Confirm a fire-and-forget send by reading the email transport's own log line.
 *
 * `sendMail` deliberately never throws (spec §75), so a caller that wants proof
 * of delivery cannot await a result. Instead it watches the two lines
 * `src/lib/server/email.ts` prints on success/failure:
 *
 *   [email] sent via SMTP to=<addr> id=<relay id>
 *   [email] sent via Brevo API to=<addr> id=<message id>
 *   [email] send failed: <reason>
 *   [email] Brevo API 401: <body>
 *   [email:nop] to=<addr> …              ← no transport configured
 *
 * Kept separate from `verify-mail-live.mjs` so the parsing/plumbing is unit
 * tested without sending mail (`mail-log-watch.test.mjs`).
 */

/** Render printf-style `%s` substitutions the way the console would. */
export function formatConsoleLine(args) {
  let i = 1;
  return String(args[0] ?? "").replace(/%s/g, () => String(args[i++] ?? ""));
}

/**
 * Classify one console line. Returns `null` when the line says nothing about a
 * send, so unrelated logs never resolve the watcher.
 */
export function classifyMailLog(line, to) {
  const sent = /^\[email\] sent via (.+?) to=(\S+) id=(\S+)/.exec(line.trim());
  if (sent) {
    if (to && sent[2] !== to) return null; // a different recipient's send
    return { status: "sent", transport: sent[1], to: sent[2], id: sent[3] };
  }
  if (!line.includes("[email")) return null;
  if (/\[email:nop\]/.test(line)) {
    return { status: "failed", detail: "no transport configured — logged no-op" };
  }
  if (/\[email\]\s*send failed:/.test(line) || /\[email\]\s*Brevo API \d/.test(line)) {
    return { status: "failed", detail: line.trim() };
  }
  return null;
}

/**
 * Tap `console.info`/`console.error` (or any `target` with those methods) until
 * `to`'s send is confirmed, fails, or `timeoutMs` elapses. Returns
 * `{ result, stop }`; `stop()` releases the hooks when nothing was sent.
 */
export function watchMailLog({ to, timeoutMs = 25_000, target = console }) {
  const original = { info: target.info, error: target.error };
  let done = false;
  let settle = () => {};
  const result = new Promise((resolve) => {
    settle = resolve;
  });
  const timer = setTimeout(
    () => finish({ status: "timeout", detail: `no transport log within ${timeoutMs}ms` }),
    timeoutMs,
  );
  function finish(outcome) {
    if (done) return;
    done = true;
    target.info = original.info;
    target.error = original.error;
    clearTimeout(timer);
    settle(outcome);
  }
  const handle = (args) => {
    const outcome = classifyMailLog(formatConsoleLine(args), to);
    if (outcome) finish(outcome);
  };
  target.info = (...args) => {
    original.info(...args);
    handle(args);
  };
  target.error = (...args) => {
    original.error(...args);
    handle(args);
  };
  return { result, stop: () => finish({ status: "skipped", detail: "not sent" }) };
}

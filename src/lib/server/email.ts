import { env } from "@/lib/env.server";

/**
 * Transactional email (spec Phase 7) — **Brevo**.
 *
 * **Transport (in order):**
 * 1. Brevo HTTP API (`https://api.brevo.com/v3/smtp/email`) when `BREVO_API_KEY`
 *    is set — preferred: no SMTP ports to negotiate, works everywhere the app
 *    can make HTTPS calls.
 * 2. Brevo SMTP relay (or any SMTP) via `nodemailer` when `MAIL_SERVER` is set
 *    (Brevo relay: `smtp-relay.brevo.com:587`, user = your SMTP login/key,
 *    password = your SMTP key).
 * 3. Logged no-op so local dev and preview work with zero configuration.
 *
 * **Contract (spec §75):**
 * - Never throws into a payment/reset flow — `sendMail` swallows transport
 *   errors after logging; callers fire-and-forget (`void send…()`).
 * - Never discloses account existence — callers decide the user-visible
 *   message (see `password-reset.ts` GENERIC reply).
 *
 * **Env:** `BREVO_API_KEY`, or `MAIL_SERVER` (host), `MAIL_PORT` (default 587),
 * `MAIL_SECURE` ("true" = 465 implicit TLS), `MAIL_USER`, `MAIL_PASSWORD`,
 * `MAIL_FROM` (default `PrintHub <no-reply@printhub.local>`).
 */

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

export function mailConfigured(): boolean {
  return Boolean(env("BREVO_API_KEY") || env("MAIL_SERVER"));
}

/** Send via Brevo's HTTP API. Returns null when the API key is unset. */
async function sendViaBrevoApi(mail: Mail): Promise<{ sent: boolean } | null> {
  const apiKey = env("BREVO_API_KEY");
  if (!apiKey) return null;
  const from = env("MAIL_FROM") ?? "PrintHub <no-reply@printhub.local>";
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  const sender = m
    ? { name: m[1] || "PrintHub", email: m[2] }
    : { name: "PrintHub", email: from };
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
        ...(mail.html ? { htmlContent: mail.html } : {}),
        ...(mail.attachments?.length
          ? {
              attachment: mail.attachments.map((a) => ({
                name: a.filename,
                content: a.content.toString("base64"),
                contentType: a.contentType,
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Brevo API %d: %s", res.status, body.slice(0, 300));
      return { sent: false };
    }
    const body = (await res.json().catch(() => null)) as { messageId?: string } | null;
    console.info("[email] sent via Brevo API to=%s id=%s", mail.to, body?.messageId ?? "-");
    return { sent: true };
  } catch (err) {
    console.error("[email] Brevo API failed:", err instanceof Error ? err.message : err);
    return { sent: false };
  }
}

/** Send (or log) one message. Resolves even when delivery fails — see contract. */
export async function sendMail(mail: Mail): Promise<{ sent: boolean }> {
  const host = env("MAIL_SERVER");
  if (!host) {
    // Brevo API first; the logged no-op only when NEITHER transport is set.
    const viaApi = await sendViaBrevoApi(mail);
    if (viaApi) return viaApi;
    console.info(
      "[email:nop] to=%s subject=%s\n%s",
      mail.to,
      mail.subject,
      mail.text.slice(0, 500),
    );
    return { sent: false };
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host,
      port: Number(env("MAIL_PORT") ?? 587),
      secure: env("MAIL_SECURE") === "true",
      auth: env("MAIL_USER") && env("MAIL_PASSWORD")
        ? { user: env("MAIL_USER")!, pass: env("MAIL_PASSWORD")! }
        : undefined,
    });
    const info = await transport.sendMail({
      from: env("MAIL_FROM") ?? "PrintHub <no-reply@printhub.local>",
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    console.info("[email] sent via SMTP to=%s id=%s", mail.to, info.messageId ?? "-");
    return { sent: true };
  } catch (err) {
    // Delivery failures must never break the caller (payment/reset flows).
    console.error("[email] send failed:", err instanceof Error ? err.message : err);
    return { sent: false };
  }
}

// ── App emails ───────────────────────────────────────────────────────────────

/** Registration OTP — 6-digit code, 10-minute TTL (registration_otps). */
export function sendRegistrationOtpMail(to: string, name: string, code: string, ttlSeconds: number) {
  const minutes = Math.round(ttlSeconds / 60);
  return sendMail({
    to,
    subject: `${code} is your PrintHub verification code`,
    text: [
      `Hi ${name},`,
      "",
      `Your PrintHub verification code is: ${code}`,
      "",
      `It expires in ${minutes} minutes. If you didn't request it, you can safely ignore this email.`,
    ].join("\n"),
    html: `<p>Hi ${escapeHtml(name)},</p>
<p>Your PrintHub verification code is:</p>
<p style="font-size:2rem;font-weight:700;letter-spacing:0.3em;margin:1rem 0"><strong>${escapeHtml(code)}</strong></p>
<p>It expires in ${minutes} minutes. If you didn't request it, you can safely ignore this email.</p>`,
  });
}

/** Password reset — the link is single-use, 30-minute TTL (password_resets). */
export function sendPasswordResetMail(to: string, resetLink: string) {
  return sendMail({
    to,
    subject: "Reset your PrintHub password",
    text: [
      "We received a request to reset your PrintHub password.",
      "",
      `Reset link (valid 30 minutes, single use): ${resetLink}`,
      "",
      "If you didn't request this, you can safely ignore this email.",
    ].join("\n"),
    html: `<p>We received a request to reset your PrintHub password.</p>
<p><a href="${resetLink}">Reset your password</a> — valid 30 minutes, single use.</p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
  });
}

type OrderMailLine = { productName: string; quantity: number; subtotalPaise: number };

function orderLines(items: OrderMailLine[], totalPaise: number): string {
  const rows = items.map(
    (i) => `  ${i.quantity} × ${i.productName} — Rs. ${(i.subtotalPaise / 100).toFixed(2)}`,
  );
  rows.push(`  Total: Rs. ${(totalPaise / 100).toFixed(2)}`);
  return rows.join("\n");
}

/** Order confirmation — fired once the payment is PAID/CONFIRMED. */
export function sendOrderConfirmationMail(input: {
  to: string;
  orderId: string;
  invoiceNumber: string | null;
  items: OrderMailLine[];
  totalPaise: number;
  customerName?: string;
}) {
  const name = input.customerName?.trim() || "there";
  const lines = orderLines(input.items, input.totalPaise);
  return sendMail({
    to: input.to,
    subject: `PrintHub order ${input.orderId} confirmed`,
    text: [
      `Hi ${name},`,
      "",
      `Your payment for order ${input.orderId} succeeded and your order is confirmed.`,
      input.invoiceNumber ? `Invoice: ${input.invoiceNumber}` : "",
      "",
      "Items:",
      lines,
      "",
      "Track it any time under Orders on PrintHub.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<p>Hi ${escapeHtml(name)},</p>
<p>Your payment for order <strong>${escapeHtml(input.orderId)}</strong> succeeded — the order is confirmed${input.invoiceNumber ? ` (invoice ${escapeHtml(input.invoiceNumber)})` : ""}.</p>
<pre>${escapeHtml(lines)}</pre>
<p>Track it any time under <strong>Orders</strong> on PrintHub.</p>`,
  });
}

/** Invoice-ready notification — sent when the PDF becomes available. */
export function sendInvoiceReadyMail(input: {
  to: string;
  orderId: string;
  invoiceNumber: string;
}) {
  return sendMail({
    to: input.to,
    subject: `Your PrintHub invoice ${input.invoiceNumber} is ready`,
    text: `Invoice ${input.invoiceNumber} for order ${input.orderId} is ready to download from your Orders page on PrintHub.`,
  });
}

/** Order status change (CONFIRMED → PROCESSING → READY → COMPLETED). */
export function sendOrderStatusMail(input: {
  to: string;
  orderId: string;
  status: string;
}) {
  return sendMail({
    to: input.to,
    subject: `PrintHub order ${input.orderId} is now ${input.status}`,
    text: `Your order ${input.orderId} status changed to ${input.status}.`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

import assert from "node:assert/strict";
import test from "node:test";

/**
 * Invoice delivery contract:
 *
 *  - the invoice renders as a REAL PDF (magic bytes + EOF marker), not a text
 *    blob and not a link;
 *  - WinAnsi-unsafe customer input (₹, ×, ·) cannot blow up rendering;
 *  - a paid order emails the invoice WITH the PDF attached — the old
 *    "your invoice is ready, go and download it" text-only mail is gone.
 *
 * Runs against PGLite with mail forced to the logged no-op, so no real email
 * leaves the process; the no-op log is how the attachment is observed.
 */

process.env.MAIL_SERVER = "";
process.env.BREVO_API_KEY = "";
// Deterministic signing secret so link assertions never depend on the dev .env.
process.env.BETTER_AUTH_SECRET = "test-invoice-signing-secret";
process.env.INVOICE_LINK_SECRET = "";

const { buildInvoicePdf } = await import("../src/lib/server/invoices.ts");
const { invoicePdfLink, signInvoicePdfToken, verifyInvoicePdfToken } = await import(
  "../src/lib/server/invoice-link.ts"
);
const { ensureInvoice } = await import("../src/lib/server/invoices.ts");
const { getOrderForUser } = await import("../src/lib/server/orders.ts");
const { notifyOrderPaid } = await import("../src/lib/server/payments.ts");
const { getSql } = await import("../src/lib/db.ts");
const email = await import("../src/lib/server/email.ts");

const RUN = Math.random().toString(36).slice(2, 8);

const invoice = {
  id: "inv_test",
  invoiceNumber: "INV-2026-000123",
  orderId: "PH-TEST-1",
  userId: "usr_test",
  paymentId: "pay_test",
  paymentStatus: "PAID",
  subtotalPaise: 40000,
  taxPaise: 0,
  totalPaise: 40000,
  currency: "INR",
  items: [
    {
      productId: "prd_a4",
      productName: "A4 Print Paper",
      quantity: 2,
      unitPricePaise: 20000,
      subtotalPaise: 40000,
    },
  ],
  createdAt: new Date().toISOString(),
};

async function captureLog(fn) {
  const lines = [];
  const original = console.info;
  console.info = (...args) => lines.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.info = original;
  }
  return lines.join("\n");
}

test("buildInvoicePdf renders a real PDF", async () => {
  const bytes = await buildInvoicePdf(invoice, {
    firstName: "Karan",
    lastName: "Suthar",
    email: "karan@example.com",
  });
  const buffer = Buffer.from(bytes);
  assert.ok(buffer.length > 1000, `pdf looks non-trivial (${buffer.length} bytes)`);
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-", "pdf header");
  assert.ok(buffer.subarray(-1024).toString("latin1").includes("%%EOF"), "pdf EOF marker");
});

test("buildInvoicePdf survives WinAnsi-unsafe customer input", async () => {
  // Helvetica's WinAnsi encoding throws on ₹ / × / · unless they are
  // transliterated — this used to 500 the whole invoice.
  const bytes = await buildInvoicePdf(invoice, {
    firstName: "Karan ₹ Suthar",
    lastName: "2 × 3 · test",
    email: "karan@example.com",
  });
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("latin1"), "%PDF-");
});

test("the invoice mail carries the PDF as an attachment", async () => {
  const bytes = await buildInvoicePdf(invoice, { firstName: "Karan", email: "karan@example.com" });

  let result;
  const log = await captureLog(async () => {
    result = await email.sendInvoiceReadyMail({
      to: "karan@example.com",
      orderId: invoice.orderId,
      invoiceNumber: invoice.invoiceNumber,
      pdf: bytes,
    });
  });

  assert.deepEqual(result, { sent: false }, "no transport configured → logged no-op");
  assert.match(log, /\[email:nop\]/);
  assert.ok(
    log.includes(`INV-2026-000123.pdf(${bytes.length}B)`),
    `the PDF is attached under the invoice number — got: ${log}`,
  );
  assert.ok(
    !log.includes("is ready to download from"),
    "the body no longer just points at a download page",
  );
});

test("the Brevo API transport encodes the PDF as a base64 attachment", async () => {
  const bytes = await buildInvoicePdf(invoice, { firstName: "Karan" });
  const originalFetch = globalThis.fetch;
  process.env.MAIL_SERVER = ""; // MAIL_SERVER unset → the HTTP API transport is used
  process.env.BREVO_API_KEY = "test-key";
  let payload;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body);
    return new Response(JSON.stringify({ messageId: "brevo-test-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  let result;
  try {
    result = await email.sendInvoiceReadyMail({
      to: "buyer@example.com",
      orderId: invoice.orderId,
      invoiceNumber: invoice.invoiceNumber,
      pdf: bytes,
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BREVO_API_KEY;
  }

  assert.deepEqual(result, { sent: true });
  assert.equal(payload.attachment.length, 1);
  assert.equal(payload.attachment[0].name, "INV-2026-000123.pdf");
  assert.equal(payload.attachment[0].contentType, "application/pdf");
  const decoded = Buffer.from(payload.attachment[0].content, "base64");
  assert.equal(decoded.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(decoded.length, bytes.length, "the whole document made it into the request");
});

test("a signed link opens its own invoice and nothing else", () => {
  const orderId = "PH-LINK-1";
  const token = signInvoicePdfToken(orderId, Date.now() + 60_000);
  assert.ok(token, "a token is minted when a secret exists");

  assert.equal(verifyInvoicePdfToken(orderId, token), true, "fresh token accepted");
  assert.equal(verifyInvoicePdfToken("PH-LINK-2", token), false, "another order is refused");
  assert.equal(
    verifyInvoicePdfToken(orderId, `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`),
    false,
    "a tampered signature is refused",
  );
  assert.equal(verifyInvoicePdfToken(orderId, "garbage"), false);
  assert.equal(verifyInvoicePdfToken(orderId, ""), false);
  assert.equal(verifyInvoicePdfToken(orderId, null), false);
  assert.equal(
    verifyInvoicePdfToken(orderId, token, Date.now() + 61_000),
    false,
    "the link expires on its own",
  );
  assert.equal(
    verifyInvoicePdfToken(orderId, signInvoicePdfToken(orderId, Date.now() - 1)),
    false,
    "an already-expired token is refused",
  );
});

test("the emailed link points at the PDF endpoint with a signature", () => {
  const link = invoicePdfLink("https://printhub.example/", "PH-LINK-9");
  assert.ok(link, "a link is produced");
  assert.ok(
    link.startsWith("https://printhub.example/api/invoices/PH-LINK-9/pdf?t="),
    `link targets the pdf endpoint — got ${link}`,
  );
  assert.equal(
    verifyInvoicePdfToken("PH-LINK-9", new URL(link).searchParams.get("t")),
    true,
    "…and the query string carries a usable signature",
  );
});

test("the invoice mail carries BOTH the attachment and the link", async () => {
  const bytes = await buildInvoicePdf(invoice, { firstName: "Karan" });
  const pdfUrl = invoicePdfLink("https://printhub.example", invoice.orderId);

  const log = await captureLog(() =>
    email.sendInvoiceReadyMail({
      to: "buyer@example.com",
      orderId: invoice.orderId,
      invoiceNumber: invoice.invoiceNumber,
      pdf: bytes,
      pdfUrl,
    }),
  );

  assert.ok(log.includes(`INV-2026-000123.pdf(${bytes.length}B)`), "PDF attached");
  assert.ok(log.includes(pdfUrl), "the download link is in the body");
  assert.ok(/works without signing in/i.test(log), "and says it needs no sign-in");
});

test("the order confirmation also carries the invoice link", async () => {
  const invoiceUrl = invoicePdfLink("https://printhub.example", invoice.orderId);
  const log = await captureLog(() =>
    email.sendOrderConfirmationMail({
      to: "buyer@example.com",
      orderId: invoice.orderId,
      invoiceNumber: invoice.invoiceNumber,
      items: invoice.items,
      totalPaise: invoice.totalPaise,
      customerName: "Karan Suthar",
      invoiceUrl,
    }),
  );
  assert.ok(log.includes(invoiceUrl), `confirmation carries the link — got ${log}`);
});

test("a paid order emails the invoice WITH the PDF attached", async () => {
  const sql = await getSql();
  const userId = `usr_invoice_${RUN}`;
  const orderId = `PH-INVOICE-${RUN}`;

  await sql`
    insert into orders (
      id, user_id, subtotal_paise, tax_paise, total_paise, currency,
      payment_status, order_status, customer_snapshot
    ) values (
      ${orderId}, ${userId}, 40000, 0, 40000, 'INR',
      'PAID', 'CONFIRMED',
      ${JSON.stringify({ email: "buyer@example.com", firstName: "Karan", lastName: "Suthar" })}::jsonb
    )
  `;
  await sql`
    insert into order_items (
      id, order_id, product_id, product_name, quantity, unit_price_paise, subtotal_paise
    ) values (
      ${`oi_${orderId}`}, ${orderId}, 'prd_a4', 'A4 Print Paper', 2, 20000, 40000
    )
  `;

  const order = await getOrderForUser(orderId, userId, true);
  assert.ok(order, "order exists");
  const record = await ensureInvoice(order, "pay_invoice_test");

  const log = await captureLog(() => notifyOrderPaid(order, record));

  assert.match(log, /PrintHub order PH-INVOICE-,|\sPrintHub order/, "order confirmation sent");
  assert.ok(
    log.includes(`${record.invoiceNumber}.pdf(`),
    `the invoice email attached ${record.invoiceNumber}.pdf — got: ${log}`,
  );
  // …and both mails carry a signed, login-free link to the same document.
  const linkMatches = log.match(/http[^\s]*\/api\/invoices\/[^\s]*?\/pdf\?t=\d+\.[a-f0-9]{64}/g) ?? [];
  assert.ok(
    linkMatches.length >= 2,
    `both mails should link to the PDF (found ${linkMatches.length}) — got: ${log}`,
  );
  assert.equal(
    verifyInvoicePdfToken(orderId, new URL(linkMatches[0]).searchParams.get("t")),
    true,
    "the emailed link is valid for that order",
  );
});

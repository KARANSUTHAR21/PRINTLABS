import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getSql } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { parseJson } from "@/lib/utils";
import { newId } from "./crypto-utils";
import { fail } from "./errors";
import type { OrderRecord } from "./orders";

export type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  orderId: string;
  userId: string;
  paymentId: string | null;
  paymentStatus: string;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
  items: OrderRecord["items"];
  createdAt: string;
};

async function nextInvoiceNumber(): Promise<string> {
  const sql = await getSql();
  const year = new Date().getFullYear();
  const rows = await sql<{ n: number }>`
    insert into invoice_counters (year, n) values (${year}, 1)
    on conflict (year) do update set n = invoice_counters.n + 1
    returning n
  `;
  const n = rows[0]?.n ?? 1;
  return `INV-${year}-${String(n).padStart(6, "0")}`;
}

export async function getInvoiceForOrder(orderId: string, userId: string, admin = false) {
  const sql = await getSql();
  const rows = admin
    ? await sql<{
        id: string;
        invoice_number: string;
        order_id: string;
        user_id: string;
        payment_id: string | null;
        payment_status: string;
        subtotal_paise: number;
        tax_paise: number;
        total_paise: number;
        currency: string;
        items: unknown;
        created_at: string;
      }>`select id, invoice_number, order_id, user_id, payment_id, payment_status,
               subtotal_paise, tax_paise, total_paise, currency, items, created_at::text as created_at
         from invoices where order_id = ${orderId} limit 1`
    : await sql<{
        id: string;
        invoice_number: string;
        order_id: string;
        user_id: string;
        payment_id: string | null;
        payment_status: string;
        subtotal_paise: number;
        tax_paise: number;
        total_paise: number;
        currency: string;
        items: unknown;
        created_at: string;
      }>`select id, invoice_number, order_id, user_id, payment_id, payment_status,
               subtotal_paise, tax_paise, total_paise, currency, items, created_at::text as created_at
         from invoices where order_id = ${orderId} and user_id = ${userId} limit 1`;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    orderId: row.order_id,
    userId: row.user_id,
    paymentId: row.payment_id,
    paymentStatus: row.payment_status,
    subtotalPaise: row.subtotal_paise,
    taxPaise: row.tax_paise,
    totalPaise: row.total_paise,
    currency: row.currency,
    items: parseJson<OrderRecord["items"]>(row.items, []),
    createdAt: row.created_at,
  } satisfies InvoiceRecord;
}

export async function ensureInvoice(order: OrderRecord, paymentId: string | null) {
  const existing = await getInvoiceForOrder(order.id, order.userId, true);
  if (existing) return existing;
  const sql = await getSql();
  const invoiceNumber = await nextInvoiceNumber();
  const id = newId("inv");
  try {
    await sql`
      insert into invoices (
        id, invoice_number, order_id, user_id, payment_id, payment_status,
        subtotal_paise, tax_paise, total_paise, currency, items
      ) values (
        ${id}, ${invoiceNumber}, ${order.id}, ${order.userId}, ${paymentId}, 'PAID',
        ${order.subtotalPaise}, ${order.taxPaise}, ${order.totalPaise}, ${order.currency},
        ${JSON.stringify(order.items)}::jsonb
      )
    `;
    await sql`
      update orders set invoice_number = ${invoiceNumber}, updated_at = now()
      where id = ${order.id} and invoice_number is null
    `;
  } catch {
    const raced = await getInvoiceForOrder(order.id, order.userId, true);
    if (raced) return raced;
    throw new Error("Could not create invoice.");
  }
  const created = await getInvoiceForOrder(order.id, order.userId, true);
  if (!created) fail("Invoice missing after create.", 500);
  return created;
}

/**
 * WinAnsi (Helvetica's encoding) covers only Latin-1-ish characters — a ₹ in
 * customer input or a `·`/`×` in copy makes pdf-lib throw and the whole PDF
 * endpoint 500s. Transliterate to ASCII so the document always renders.
 */
function toAscii(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00d7\u2715]/g, "x")
    .replace(/[\u00b7\u2022\u25cf]/g, ".")
    .replace(/[\u20b9\u20a8]/g, "Rs.")
    .replace(/₹/g, "Rs.")
    .replace(/[^\x20-\x7E]/g, "");
}

/** Format paise as an ASCII-safe rupee amount ("Rs. 200.00") for Helvetica. */
function formatINRAscii(paiseAmount: number): string {
  return toAscii(formatINR(paiseAmount)).replace("\u00a0", " ");
}

export async function buildInvoicePdf(invoice: InvoiceRecord, customer: Record<string, string>) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.14, 0.25);
  const muted = rgb(0.36, 0.43, 0.51);
  const blue = rgb(0.11, 0.44, 0.91);
  let y = 790;
  page.drawText("PrintHub", { x: 48, y, size: 22, font: bold, color: blue });
  y -= 18;
  page.drawText("Print . Copy . Scan . Stationery", { x: 48, y, size: 9, font, color: muted });
  page.drawText("INVOICE", { x: 430, y: 790, size: 16, font: bold, color: ink });
  y = 740;
  page.drawText(`Invoice ${invoice.invoiceNumber}`, { x: 48, y, size: 11, font: bold, color: ink });
  y -= 16;
  page.drawText(`Order ${invoice.orderId}`, { x: 48, y, size: 10, font, color: muted });
  y -= 14;
  page.drawText(`Date ${toAscii(new Date(invoice.createdAt).toLocaleString("en-IN"))}`, {
    x: 48,
    y,
    size: 10,
    font,
    color: muted,
  });
  y -= 14;
  if (invoice.paymentId) {
    page.drawText(`Payment ${invoice.paymentId}`, { x: 48, y, size: 10, font, color: muted });
    y -= 14;
  }
  y -= 10;
  const name = toAscii(`${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || "Customer");
  page.drawText("Bill to", { x: 48, y, size: 9, font: bold, color: muted });
  y -= 14;
  page.drawText(name, { x: 48, y, size: 11, font: bold, color: ink });
  y -= 14;
  if (customer.email) {
    page.drawText(toAscii(customer.email), { x: 48, y, size: 10, font, color: muted });
    y -= 16;
  }
  y -= 8;
  page.drawText("Item", { x: 48, y, size: 9, font: bold, color: muted });
  page.drawText("Qty", { x: 320, y, size: 9, font: bold, color: muted });
  page.drawText("Price", { x: 370, y, size: 9, font: bold, color: muted });
  page.drawText("Amount", { x: 470, y, size: 9, font: bold, color: muted });
  y -= 8;
  page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: rgb(0.89, 0.91, 0.94) });
  y -= 18;
  for (const item of invoice.items) {
    page.drawText(toAscii(item.productName).slice(0, 40), { x: 48, y, size: 10, font, color: ink });
    page.drawText(String(item.quantity), { x: 320, y, size: 10, font, color: ink });
    page.drawText(formatINRAscii(item.unitPricePaise), { x: 370, y, size: 10, font, color: ink });
    page.drawText(formatINRAscii(item.subtotalPaise), { x: 470, y, size: 10, font, color: ink });
    y -= 18;
  }
  y -= 8;
  page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: rgb(0.89, 0.91, 0.94) });
  y -= 22;
  page.drawText("Subtotal", { x: 370, y, size: 10, font, color: muted });
  page.drawText(formatINRAscii(invoice.subtotalPaise), { x: 470, y, size: 10, font, color: ink });
  y -= 16;
  page.drawText("Tax (0%)", { x: 370, y, size: 10, font, color: muted });
  page.drawText(formatINRAscii(invoice.taxPaise), { x: 470, y, size: 10, font, color: ink });
  y -= 18;
  page.drawText("Total", { x: 370, y, size: 12, font: bold, color: ink });
  page.drawText(formatINRAscii(invoice.totalPaise), { x: 470, y, size: 12, font: bold, color: ink });
  y -= 36;
  page.drawText("PAID", { x: 48, y, size: 14, font: bold, color: rgb(0.12, 0.48, 0.3) });
  y -= 28;
  page.drawText("Good ideas get printed.", { x: 48, y, size: 10, font, color: blue });
  return doc.save();
}

import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { verifyInvoicePdfToken } from "@/lib/server/invoice-link";
import { buildInvoicePdf, getInvoiceForOrder } from "@/lib/server/invoices";
import { getOrderForUser } from "@/lib/server/orders";
import { isAdmin } from "@/lib/server/profile";

/**
 * Invoice PDF download.
 *
 * Two ways in:
 *  - a signed-in session (`Authorization: Bearer …`, or the session cookie);
 *  - a link signed with `?t=<expiresAtMs>.<hmac>` — this is the URL we put in
 *    the invoice email, so a customer who opens the message on a device where
 *    they are not signed in still gets their invoice instead of a 401.
 *
 * A signed link is a bearer credential for exactly one order's PDF, so the
 * response is never cacheable.
 */
export const Route = createFileRoute("/api/invoices/$orderId/pdf")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const signedLink = verifyInvoicePdfToken(
          params.orderId,
          new URL(request.url).searchParams.get("t"),
        );

        let userId = "";
        let admin = signedLink;
        if (!signedLink) {
          const authHeader = request.headers.get("authorization");
          const bearer = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : undefined;
          const user = await getSessionUser(bearer);
          if (!user) return new Response("Unauthorized", { status: 401 });
          userId = user.id;
          admin = await isAdmin(user.id);
        }

        const invoice = await getInvoiceForOrder(params.orderId, userId, admin);
        if (!invoice) return new Response("Not found", { status: 404 });
        const order = await getOrderForUser(params.orderId, userId, admin);
        const bytes = await buildInvoicePdf(invoice, order?.customer ?? {});
        return new Response(Buffer.from(bytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});

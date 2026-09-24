import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { buildInvoicePdf, getInvoiceForOrder } from "@/lib/server/invoices";
import { getOrderForUser } from "@/lib/server/orders";
import { isAdmin } from "@/lib/server/profile";

export const Route = createFileRoute("/api/invoices/$orderId/pdf")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const authHeader = request.headers.get("authorization");
        const bearer = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7)
          : undefined;
        const user = await getSessionUser(bearer);
        if (!user) return new Response("Unauthorized", { status: 401 });
        const admin = await isAdmin(user.id);
        const invoice = await getInvoiceForOrder(params.orderId, user.id, admin);
        if (!invoice) return new Response("Not found", { status: 404 });
        const order = await getOrderForUser(params.orderId, user.id, admin);
        const bytes = await buildInvoicePdf(invoice, order?.customer ?? {});
        return new Response(Buffer.from(bytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
          },
        });
      },
    },
  },
});

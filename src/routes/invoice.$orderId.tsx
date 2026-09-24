import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download } from "lucide-react";
import { Protected } from "@/components/auth/protected";
import { loadInvoice, loadOrder } from "@/lib/api/commerce";
import { formatINR } from "@/lib/money";
import type { InvoiceRecord } from "@/lib/server/invoices";
import type { OrderRecord } from "@/lib/server/orders";

export const Route = createFileRoute("/invoice/$orderId")({ component: InvoiceRoute });

function InvoiceRoute() {
  return (
    <Protected>
      <InvoicePage />
    </Protected>
  );
}

function InvoicePage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadOrder({ data: orderId }).then((res) => {
      if (res.success) setOrder(res.order);
      else setError(res.message);
    });
    void loadInvoice({ data: orderId }).then((res) => {
      if (res.success) setInvoice(res.invoice);
      else if (res.status !== 401) setError(res.message);
    });
  }, [orderId]);

  if (error) return <main className="container-page py-20 text-sm text-danger">{error}</main>;
  if (!invoice) return <main className="container-page py-20 text-sm text-muted">Loading invoice...</main>;

  return (
    <main className="container-page max-w-3xl py-12">
      <div className="card-surface p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">PrintHub</p>
            <h1 className="mt-2 text-3xl font-extrabold">Invoice {invoice.invoiceNumber}</h1>
            <p className="mt-1 text-sm text-muted">
              Order {invoice.orderId} · {new Date(invoice.createdAt).toLocaleString("en-IN")}
            </p>
          </div>
          <span className="rounded-full bg-mist px-4 py-1.5 text-sm font-bold text-success">
            Payment: {invoice.paymentStatus}
          </span>
        </div>

        {order && (
          <p className="mt-4 text-sm text-muted">
            Billed to{" "}
            <span className="font-semibold text-ink">
              {`${order.customer.firstName ?? ""} ${order.customer.lastName ?? ""}`.trim() || "Customer"}
            </span>
            {order.customer.email ? ` · ${order.customer.email}` : ""}
          </p>
        )}

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2">Product</th>
              <th className="py-2 text-right">Quantity</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.productId} className="border-b border-line/60">
                <td className="py-3 font-medium">{item.productName}</td>
                <td className="py-3 text-right tabular-nums">{item.quantity}</td>
                <td className="py-3 text-right tabular-nums">{formatINR(item.unitPricePaise)}</td>
                <td className="py-3 text-right tabular-nums">{formatINR(item.subtotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="tabular-nums text-ink">{formatINR(invoice.subtotalPaise)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Tax</span>
            <span className="tabular-nums text-ink">{formatINR(invoice.taxPaise)}</span>
          </div>
          <div className="flex justify-between pt-1 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatINR(invoice.totalPaise)}</span>
          </div>
        </div>

        {invoice.paymentId && (
          <p className="mt-6 text-xs text-muted">Payment ID: {invoice.paymentId}</p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`/api/invoices/${invoice.orderId}/pdf`} className="btn-navy">
            <Download className="size-4" />
            Download PDF
          </a>
          <Link to="/orders/$orderId" params={{ orderId: invoice.orderId }} className="btn-outline">
            View order
          </Link>
          <Link to="/orders" className="btn-outline">
            View orders
          </Link>
          <Link to="/products" className="btn-primary">
            <CheckCircle2 className="size-4" />
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}

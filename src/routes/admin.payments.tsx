import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { adminListPaymentAttempts } from "@/lib/api/admin";

export const Route = createFileRoute("/admin/payments")({ component: AdminPaymentsRoute });
type PaymentRow = { id: string; orderId: string; customerId: string; customerEmail: string | null; amountPaise: number; currency: string; status: string; providerStatus: string | null; providerOrderId: string | null; providerPaymentId: string | null; createdAt: string; expiresAt: string };
function AdminPaymentsRoute() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void adminListPaymentAttempts().then((result) => { if (result.success) setPayments(result.payments); else setError(result.message); }).catch(() => setError("Could not load payment attempts.")); }, []);
  return <AdminShell><AdminPageHeading title="Payments" description="Read-only provider payment attempt records. Payment capture is accepted only from verified provider confirmations and webhooks." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Order / attempt", "Customer", "Amount", "Status", "Provider IDs", "Created"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-line"><td className="px-4 py-3"><p>{payment.orderId}</p><p className="text-[10px] text-muted">{payment.id}</p></td><td className="px-4 py-3">{payment.customerEmail ?? payment.customerId}</td><td className="px-4 py-3">{payment.amountPaise} {payment.currency}</td><td className="px-4 py-3">{payment.status}{payment.providerStatus ? ` · ${payment.providerStatus}` : ""}</td><td className="px-4 py-3 text-xs">{payment.providerOrderId ?? "—"}<span className="block">{payment.providerPaymentId ?? "—"}</span></td><td className="px-4 py-3 text-xs text-muted">{new Date(payment.createdAt).toLocaleString()}</td></tr>)}</tbody></table>{payments.length === 0 && <p className="p-8 text-sm text-muted">No payment attempts found.</p>}</section></AdminShell>;
}

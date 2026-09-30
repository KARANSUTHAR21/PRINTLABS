import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";
export const Route = createFileRoute("/vendor/subscription/payment-history")({ component: PaymentHistoryRoute });
function PaymentHistoryRoute() { return <VendorShell><VendorPageHeading eyebrow="Subscription" title="Payment history" description="Vendor subscription charges and their verified payment status." /><section className="card-surface grid min-h-56 place-items-center p-8 text-center"><div><CreditCard className="mx-auto size-8 text-muted-2" /><h2 className="mt-3 font-bold">No subscription payments</h2><p className="mt-2 text-sm text-muted">Your starter trial has no charge. Paid billing is not connected yet.</p></div></section></VendorShell>; }

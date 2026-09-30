import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";
export const Route = createFileRoute("/vendor/receipts/subscriptions")({ component: SubscriptionReceiptsRoute });
function SubscriptionReceiptsRoute() { return <VendorShell><VendorPageHeading eyebrow="Receipts · Subscription" title="Subscription receipts" description="Receipts for verified vendor subscription payments." /><section className="card-surface grid min-h-56 place-items-center p-8 text-center"><div><FileText className="mx-auto size-8 text-muted-2" /><h2 className="mt-3 font-bold">No subscription payment receipts</h2><p className="mt-2 text-sm text-muted">A free starter trial was created at vendor approval. Paid plans and payment receipts have not been connected.</p></div></section></VendorShell>; }

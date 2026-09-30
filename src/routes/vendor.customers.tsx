import { createFileRoute } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";
export const Route = createFileRoute("/vendor/customers")({ component: CustomersRoute });
function CustomersRoute(){return <VendorShell><VendorPageHeading eyebrow="Shop" title="Customers" description="Customer references from your shop's paid orders only."/><section className="card-surface grid min-h-56 place-items-center p-8 text-center"><div><UserRound className="mx-auto size-8 text-muted-2"/><h2 className="mt-3 font-bold">No shop customers yet</h2><p className="mt-2 text-sm text-muted">Customer information will only appear after shop-scoped paid orders exist.</p></div></section></VendorShell>}

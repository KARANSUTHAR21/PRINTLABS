import { createFileRoute } from "@tanstack/react-router";
import { VendorNotice, VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";

export const Route = createFileRoute("/vendor/subscription/plans")({ component: PlansRoute });

const PLANS = [
  { name: "Starter", price: "₹0", detail: "Free 30-day trial" },
  { name: "Pro Vendor", price: "Coming soon", detail: "Monthly billing" },
  { name: "Business", price: "Coming soon", detail: "Annual billing" },
];

function PlansRoute() {
  return (
    <VendorShell>
      <VendorPageHeading
        eyebrow="Subscription"
        title="Plans & billing"
        description="Paid subscription plans will become available after billing is integrated."
      />
      <VendorNotice tone="warning">
        Paid plan checkout, subscription receipts, and renewals are not connected. Admin approval creates the free Starter Trial; no purchase button is active.
      </VendorNotice>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <section key={plan.name} className="card-surface p-5">
            <p className="text-xs font-semibold text-muted">PrintHub Vendor</p>
            <h2 className="mt-2 text-xl font-bold">{plan.name}</h2>
            <p className="mt-3 text-2xl font-extrabold">{plan.price}</p>
            <p className="mt-1 text-sm text-muted">{plan.detail}</p>
            <button type="button" disabled className="btn-outline mt-5 w-full opacity-60">Unavailable</button>
          </section>
        ))}
      </div>
    </VendorShell>
  );
}

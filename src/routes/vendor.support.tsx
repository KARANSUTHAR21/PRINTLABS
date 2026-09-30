import { createFileRoute } from "@tanstack/react-router";
import { CircleHelp } from "lucide-react";
import { VendorNotice, VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";

export const Route = createFileRoute("/vendor/support")({ component: VendorSupportRoute });

function VendorSupportRoute() {
  return (
    <VendorShell>
      <VendorPageHeading
        eyebrow="PrintHub"
        title="Vendor support"
        description="Get help with shop onboarding, verification, inventory and your account."
      />
      <section className="card-surface max-w-2xl p-6">
        <span className="grid size-12 place-items-center rounded-full bg-blue-50 text-primary">
          <CircleHelp className="size-6" />
        </span>
        <h2 className="mt-4 text-lg font-bold">Need help?</h2>
        <p className="mt-2 text-sm text-muted">
          Include your shop name and application reference when contacting your PrintHub administrator. Never send passwords, account numbers, or pickup codes.
        </p>
        <div className="mt-5">
          <VendorNotice tone="info">
            PrintHub’s support contact has not been configured in this environment. Use the contact channel provided by your administrator.
          </VendorNotice>
        </div>
      </section>
    </VendorShell>
  );
}

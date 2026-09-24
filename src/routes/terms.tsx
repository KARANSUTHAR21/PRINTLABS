import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({ component: TermsRoute });

function TermsRoute() {
  return (
    <main className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-extrabold">Terms</h1>
      <div className="prose-print mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <p>PrintHub prepares orders from the files, product selections and contact details you provide. Review artwork, spelling, quantities and pickup details before payment.</p>
        <p>Custom print jobs may be started soon after payment, so cancellations are handled case by case. Stock products can be adjusted before pickup when the order has not been packed.</p>
        <p>Invoices and payment records are generated from confirmed order data. Contact the shop with your order number for corrections or support.</p>
      </div>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: PrivacyRoute });

function PrivacyRoute() {
  return (
    <main className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-extrabold">Privacy</h1>
      <div className="prose-print mt-6 space-y-4 text-sm leading-relaxed text-muted">
        <p>PrintHub uses account, cart, order and payment details to provide checkout, pickup, invoices and customer support.</p>
        <p>Uploaded or shared order details are used only to complete requested services. Payment processing is handled through the configured payment provider.</p>
        <p>You can update profile details from your account page. For order history or invoice questions, contact the shop with your order number.</p>
      </div>
    </main>
  );
}

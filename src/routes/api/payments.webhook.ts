import { createFileRoute } from "@tanstack/react-router";
import { handleWebhook } from "@/lib/server/payments";

export const Route = createFileRoute("/api/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-razorpay-signature");
        try {
          const result = await handleWebhook(raw, signature);
          return Response.json({ success: true, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Webhook rejected";
          const status = (err as { status?: number }).status ?? 400;
          return Response.json({ success: false, message }, { status });
        }
      },
    },
  },
});

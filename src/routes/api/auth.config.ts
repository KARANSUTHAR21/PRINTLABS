import { createFileRoute } from "@tanstack/react-router";
import { directGoogleConfigured } from "@/lib/auth/server";

/**
 * Public auth configuration flags (no secrets) — lets the client pick the
 * Google sign-in strategy without guessing: `direct` means this app's own
 * Google Cloud client is configured server-side (consent screen shows this
 * app), `brokered` means fall back to the shared broker client.
 */
export const Route = createFileRoute("/api/auth/config")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          JSON.stringify({ googleStrategy: directGoogleConfigured ? "direct" : "brokered" }),
          { headers: { "Content-Type": "application/json" } },
        ),
    },
  },
});

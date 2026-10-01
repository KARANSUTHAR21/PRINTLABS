import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPageHeading, DeliveryShell } from "@/components/delivery/delivery-shell";
import { loadMyDeliveryPreferences, saveMyDeliveryAvailability } from "@/lib/api/delivery";

export const Route = createFileRoute("/delivery/settings")({ component: DeliverySettingsRoute });
function DeliverySettingsRoute() {
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { void loadMyDeliveryPreferences().then((result) => { if (result.success) setAvailable(result.preferences.available); else setError(result.message); }).catch(() => setError("Could not load availability settings.")).finally(() => setLoading(false)); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const result = await saveMyDeliveryAvailability({ data: { available } }); if (!result.success) setError(result.message); else setMessage(available ? "You are available for new delivery assignments." : "You will not receive new assignments while unavailable."); } catch { setError("Could not save availability."); } finally { setBusy(false); } }
  return <DeliveryShell><DeliveryPageHeading title="Settings" description="Choose whether Admins may assign new deliveries to your account. Existing assignments remain visible to you." /><form className="card-surface max-w-xl p-6" onSubmit={(event) => void save(event)}><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={available} disabled={loading || busy} onChange={(event) => setAvailable(event.target.checked)} /><span><span className="font-semibold">Available for new deliveries</span><span className="mt-1 block text-sm text-muted">When disabled, new assignments are rejected by the server even if a client UI is stale.</span></span></label>{error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}{message && <p role="status" className="mt-4 text-sm text-success">{message}</p>}<button className="btn-primary mt-5" disabled={loading || busy}>{busy ? "Saving…" : "Save settings"}</button></form></DeliveryShell>;
}

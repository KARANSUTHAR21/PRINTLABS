import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPageHeading, DeliveryShell } from "@/components/delivery/delivery-shell";
import { loadMyDeliveryEarnings } from "@/lib/api/delivery";

export const Route = createFileRoute("/delivery/earnings")({ component: DeliveryEarningsRoute });
type Earnings = { deliveredCount: number; deliveredOrderValuePaise: number; payoutsConfigured: false };
function DeliveryEarningsRoute() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void loadMyDeliveryEarnings().then((result) => { if (result.success) setEarnings(result.earnings); else setError(result.message); }).catch(() => setError("Could not load delivery summary.")); }, []);
  return <DeliveryShell><DeliveryPageHeading title="Earnings" description="This summary counts your completed, paid deliveries. It is order value, not partner compensation." />{error && <p role="alert" className="text-sm text-danger">{error}</p>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><section className="card-surface p-6"><p className="text-sm text-muted">Completed deliveries</p><p className="mt-2 text-3xl font-extrabold">{earnings?.deliveredCount ?? "—"}</p></section><section className="card-surface p-6"><p className="text-sm text-muted">Delivered order value</p><p className="mt-2 text-3xl font-extrabold">{earnings ? `₹${(earnings.deliveredOrderValuePaise / 100).toFixed(2)}` : "—"}</p></section></div><p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Partner rates, earnings calculations, and payouts are not configured. No payout amount is calculated or promised on this page.</p></DeliveryShell>;
}

import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { VendorNotice, VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";
import { changeVendorStock, loadVendorInventory } from "@/lib/api/vendor";
import type { VendorInventoryItem } from "@/lib/server/vendor";

export const Route = createFileRoute("/vendor/inventory/stock")({ component: StockRoute });

function StockRoute() {
  const [items, setItems] = useState<VendorInventoryItem[]>([]);
  const [id, setId] = useState("");
  const [delta, setDelta] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await loadVendorInventory({ data: {} });
    if (result.success) setItems(result.products);
    else setError(result.message);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setError("Could not load your inventory. Please try again."));
  }, [refresh]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await changeVendorStock({
        data: { listingId: id, quantityChange: Number(delta), note },
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setMessage(`Stock updated. Available quantity: ${result.stock.available_quantity}`);
      await refresh();
    } catch {
      setError("Could not update stock. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <VendorShell>
      <VendorPageHeading
        eyebrow="Inventory"
        title="Stock update"
        description="Adjust your shop’s available quantity with a guarded server-side update."
        action={<Link to="/vendor/inventory/history" className="btn-outline">View stock history</Link>}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_1.2fr]">
        <form onSubmit={(event) => void submit(event)} className="card-surface grid h-fit gap-4 p-6">
          <h2 className="font-bold">Adjust stock</h2>
          <label className="text-sm font-semibold">
            Product
            <select className="field mt-1 w-full" value={id} onChange={(event) => setId(event.target.value)} required>
              <option value="">Choose product…</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name} · {item.available_quantity} available</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Quantity change (negative to reduce)
            <span className="field mt-1">
              <input type="number" min={-1_000_000} max={1_000_000} step="1" value={delta} onChange={(event) => setDelta(event.target.value)} required />
            </span>
          </label>
          <label className="text-sm font-semibold">
            Note (optional)
            <span className="field mt-1"><input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} /></span>
          </label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {message && <VendorNotice tone="success">{message}</VendorNotice>}
          <button className="btn-primary" disabled={busy || items.length === 0 || Number(delta) === 0}>
            {busy ? "Updating…" : "Update stock"}
          </button>
        </form>
        <section className="card-surface p-5">
          <h2 className="font-bold">Inventory update rules</h2>
          <div className="mt-4">
            <VendorNotice>
              Stock reductions are available for your own listings. Increases require an active subscription and an active, verified shop.
            </VendorNotice>
          </div>
          <p className="mt-4 text-sm text-muted">
            Every accepted adjustment is recorded with its resulting available quantity in Stock History.
          </p>
        </section>
      </div>
    </VendorShell>
  );
}

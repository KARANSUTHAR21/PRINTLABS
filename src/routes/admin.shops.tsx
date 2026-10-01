import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { loadVendorShopsForAdminFn, setVendorShopAdminFn } from "@/lib/api/vendor";
import type { AdminVendorShopRecord } from "@/lib/server/vendor";

export const Route = createFileRoute("/admin/shops")({ component: AdminShopsRoute });
function AdminShopsRoute() {
  const [shops, setShops] = useState<AdminVendorShopRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function refresh() { const result = await loadVendorShopsForAdminFn(); if (result.success) setShops(result.shops); else setError(result.message); }
  useEffect(() => { void refresh().catch(() => setError("Could not load shops.")); }, []);
  async function update(shopId: string, patch: { verified?: boolean; active?: boolean }) {
    setBusy(shopId); setError("");
    try { const result = await setVendorShopAdminFn({ data: { shopId, ...patch } }); if (!result.success) setError(result.message); else await refresh(); }
    catch { setError("Could not update this shop."); }
    finally { setBusy(""); }
  }
  return <AdminShell><AdminPageHeading title="Shops" description="Admin-owned shop verification and activation. Activating a shop requires verification and an active subscription." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Shop", "Vendor", "Location", "Verification", "Status", "Actions"].map((title) => <th key={title} className="px-4 py-3">{title}</th>)}</tr></thead><tbody>{shops.map((shop) => <tr key={shop.id} className="border-t border-line"><td className="px-4 py-3 font-semibold">{shop.name}<span className="block text-xs text-muted">{shop.category}</span></td><td className="px-4 py-3 text-xs text-muted">{shop.vendorId}</td><td className="px-4 py-3">{shop.city}, {shop.state}</td><td className="px-4 py-3">{shop.verified ? "Verified" : "Not verified"}</td><td className="px-4 py-3">{shop.active ? "Active" : "Inactive"}</td><td className="px-4 py-3"><div className="flex gap-2"><button className="btn-outline min-h-9 px-3 text-xs" disabled={Boolean(busy)} onClick={() => void update(shop.id, { verified: !shop.verified })}>{shop.verified ? "Revoke verification" : "Verify"}</button><button className="btn-outline min-h-9 px-3 text-xs" disabled={Boolean(busy) || (!shop.verified && !shop.active)} onClick={() => void update(shop.id, { active: !shop.active })}>{shop.active ? "Deactivate" : "Activate"}</button></div></td></tr>)}</tbody></table>{shops.length === 0 && <p className="p-8 text-sm text-muted">No approved shops.</p>}</section></AdminShell>;
}

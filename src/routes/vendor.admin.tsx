import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VendorNotice, VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";
import {
  decideVendorApplication,
  loadVendorApplications,
  loadVendorShopsForAdminFn,
  setVendorShopAdminFn,
} from "@/lib/api/vendor";
import type { AdminVendorShopRecord, VendorApplicationRecord } from "@/lib/server/vendor";
import { RoleProtected } from "@/components/auth/role-protected";

export const Route = createFileRoute("/vendor/admin")({ component: VendorAdminRoute });

function VendorAdminRoute() {
  const [applications, setApplications] = useState<VendorApplicationRecord[]>([]);
  const [shops, setShops] = useState<AdminVendorShopRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [applicationResult, shopResult] = await Promise.all([
        loadVendorApplications(),
        loadVendorShopsForAdminFn(),
      ]);
      if (!applicationResult.success) {
        setError(applicationResult.message);
        return;
      }
      if (!shopResult.success) {
        setError(shopResult.message);
        return;
      }
      setApplications(applicationResult.applications);
      setShops(shopResult.shops);
    } catch {
      setError("Could not load vendor applications and shops. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(applicationId: string, decision: "APPROVED" | "REJECTED") {
    setBusy(applicationId);
    setError("");
    try {
      const result = await decideVendorApplication({ data: { applicationId, decision } });
      if (!result.success) setError(result.message);
      else await refresh();
    } catch {
      setError("Could not review this application. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setShop(shopId: string, patch: { verified?: boolean; active?: boolean }) {
    setBusy(shopId);
    setError("");
    try {
      const result = await setVendorShopAdminFn({ data: { shopId, ...patch } });
      if (!result.success) setError(result.message);
      else await refresh();
    } catch {
      setError("Could not update this shop. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <RoleProtected allowedRoles={["ADMIN"]}><VendorShell>
      <VendorPageHeading
        eyebrow="PrintHub operations"
        title="Vendor approvals"
        description="Admin-only review for onboarding, verification and shop activation."
      />
      {error && <VendorNotice tone="warning">{error}</VendorNotice>}

      <section className="card-surface mb-5 p-5">
        <h2 className="font-bold">Pending applications</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading applications…</p>
        ) : applications.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No vendor applications awaiting review.</p>
        ) : (
          <div className="mt-4 divide-y divide-line">
            {applications.map((application) => (
              <article key={application.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div>
                  <h3 className="font-semibold">{application.business_name}</h3>
                  <p className="text-sm text-muted">
                    {application.category} · {application.city}, {application.state} · {application.contact_phone}
                  </p>
                  <p className="text-xs text-muted">{application.address_line} · {application.pincode}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy === application.id}
                    onClick={() => void decide(application.id, "REJECTED")}
                    className="btn-outline text-sm"
                  >
                    Reject
                  </button>
                  <button
                    disabled={busy === application.id}
                    onClick={() => void decide(application.id, "APPROVED")}
                    className="btn-primary text-sm"
                  >
                    Approve vendor
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card-surface p-5">
        <h2 className="font-bold">Approved vendor shops</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading shops…</p>
        ) : shops.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No approved vendor shops.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-canvas text-xs text-muted">
                <tr>{["Shop", "Location", "Verification", "Shop status", "Admin actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop.id} className="border-t border-line-soft">
                    <td className="px-3 py-3">
                      <p className="font-semibold">{shop.name}</p>
                      <p className="text-xs text-muted">{shop.phone}</p>
                    </td>
                    <td className="px-3 py-3 text-muted">{shop.city}, {shop.state}</td>
                    <td className="px-3 py-3">
                      {shop.verified
                        ? `Verified ${shop.verifiedAt ? new Date(shop.verifiedAt).toLocaleDateString("en-IN") : ""}`
                        : "Not verified"}
                    </td>
                    <td className="px-3 py-3">{shop.active ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={busy === shop.id}
                          className="btn-outline min-h-8 px-3 text-xs"
                          onClick={() => void setShop(shop.id, { verified: !shop.verified })}
                        >
                          {shop.verified ? "Revoke verification" : "Verify shop"}
                        </button>
                        <button
                          disabled={busy === shop.id || (!shop.active && !shop.verified)}
                          className="btn-outline min-h-8 px-3 text-xs"
                          onClick={() => void setShop(shop.id, { active: !shop.active })}
                        >
                          {shop.active ? "Deactivate shop" : "Activate shop"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-5">
        <VendorNotice tone="info">
          Application approval creates an inactive, unverified vendor account. Shop activation requires Admin verification and an active subscription.
        </VendorNotice>
      </div>
    </VendorShell></RoleProtected>
  );
}

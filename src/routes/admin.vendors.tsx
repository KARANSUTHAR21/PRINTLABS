import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { decideVendorApplication, loadVendorApplications } from "@/lib/api/vendor";
import type { VendorApplicationRecord } from "@/lib/server/vendor";

export const Route = createFileRoute("/admin/vendors")({ component: AdminVendorsRoute });
function AdminVendorsRoute() {
  const [applications, setApplications] = useState<VendorApplicationRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function refresh() { const result = await loadVendorApplications(); if (result.success) setApplications(result.applications); else setError(result.message); }
  useEffect(() => { void refresh().catch(() => setError("Could not load vendor applications.")); }, []);
  async function decide(applicationId: string, decision: "APPROVED" | "REJECTED") {
    setBusy(applicationId); setError("");
    try { const result = await decideVendorApplication({ data: { applicationId, decision } }); if (!result.success) setError(result.message); else await refresh(); }
    catch { setError("Could not update this vendor application."); }
    finally { setBusy(""); }
  }
  return <AdminShell><AdminPageHeading title="Vendors" description="Review pending vendor applications. Approving an application is the only flow that grants the VENDOR role." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface divide-y divide-line">{applications.map((application) => <article key={application.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><h2 className="font-bold">{application.business_name}</h2><p className="mt-1 text-sm text-muted">{application.category} · {application.city}, {application.state} · {application.contact_phone}</p><p className="text-xs text-muted">{application.address_line} · {application.pincode}</p></div><div className="flex gap-2"><button className="btn-outline" disabled={Boolean(busy)} onClick={() => void decide(application.id, "REJECTED")}>Reject</button><button className="btn-primary" disabled={Boolean(busy)} onClick={() => void decide(application.id, "APPROVED")}>{busy === application.id ? "Saving…" : "Approve vendor"}</button></div></article>)}{applications.length === 0 && <p className="p-8 text-sm text-muted">No applications are waiting for review.</p>}</section></AdminShell>;
}

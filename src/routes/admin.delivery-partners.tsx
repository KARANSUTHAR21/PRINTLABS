import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { loadAdminDeliveryPartners } from "@/lib/api/delivery";

type Partner = { userId: string; firstName: string; lastName: string; phone: string | null; available: boolean; activeAssignments: number; deliveredCount: number };
export const Route = createFileRoute("/admin/delivery-partners")({ component: AdminDeliveryPartnersRoute });
function AdminDeliveryPartnersRoute() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void loadAdminDeliveryPartners().then((result) => { if (result.success) setPartners(result.partners); else setError(result.message); }).catch(() => setError("Could not load delivery partners.")); }, []);
  return <AdminShell><AdminPageHeading title="Delivery partners" description="Partner account roles are managed in Users. Availability is set by the partner and assignment SQL checks it before dispatch." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface overflow-x-auto"><table className="w-full min-w-[740px] text-left text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Partner", "Phone", "Availability", "Active deliveries", "Completed deliveries", "User ID"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{partners.map((partner) => <tr key={partner.userId} className="border-t border-line"><td className="px-4 py-3 font-semibold">{`${partner.firstName} ${partner.lastName}`.trim() || "Delivery Partner"}</td><td className="px-4 py-3">{partner.phone ?? "—"}</td><td className="px-4 py-3">{partner.available ? "Available" : "Unavailable"}</td><td className="px-4 py-3">{partner.activeAssignments}</td><td className="px-4 py-3">{partner.deliveredCount}</td><td className="px-4 py-3 text-xs text-muted">{partner.userId}</td></tr>)}</tbody></table>{partners.length === 0 && <p className="p-8 text-sm text-muted">No delivery partner accounts found.</p>}</section></AdminShell>;
}

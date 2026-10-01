import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { adminListServices, adminUpsertService } from "@/lib/api/admin";
import type { ServiceRow } from "@/lib/server/catalog";

export const Route = createFileRoute("/admin/services")({ component: AdminServicesRoute });

function AdminServicesRoute() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() {
    const result = await adminListServices();
    if (result.success) setServices(result.services);
    else setError(result.message);
  }

  useEffect(() => {
    void refresh().catch(() => setError("Could not load services."));
  }, []);

  async function update(service: ServiceRow, patch: { active?: boolean; sortOrder?: number }) {
    setBusy(service.id);
    setError("");
    try {
      const result = await adminUpsertService({ data: { id: service.id, ...patch } });
      if (!result.success) setError(result.message);
      else await refresh();
    } catch {
      setError("Could not update this service.");
    } finally {
      setBusy("");
    }
  }

  return (
    <AdminShell>
      <AdminPageHeading title="Services" description="Manage service visibility and ordering in the public PrintHub catalog. Changes are audited and invalidated from the server." />
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}
      <section className="card-surface divide-y divide-line">
        {services.map((service) => (
          <article key={service.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="font-bold">{service.title}</h2>
              <p className="mt-1 text-sm text-muted">{service.subtitle}</p>
              <p className="mt-1 text-xs text-muted">/{service.slug} · sort order {service.sort_order} · {service.active ? "Visible" : "Hidden"}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted">Order
                <input className="field ml-2 min-h-9 w-20" type="number" min="0" defaultValue={service.sort_order} aria-label={`Sort order for ${service.title}`} onBlur={(event) => {
                  const sortOrder = Number(event.currentTarget.value);
                  if (Number.isInteger(sortOrder) && sortOrder >= 0 && sortOrder !== service.sort_order) void update(service, { sortOrder });
                }} />
              </label>
              <button className="btn-outline min-h-9" disabled={Boolean(busy)} onClick={() => void update(service, { active: !service.active })}>
                {busy === service.id ? "Saving…" : service.active ? "Hide service" : "Show service"}
              </button>
            </div>
          </article>
        ))}
        {services.length === 0 && <p className="p-8 text-sm text-muted">No services configured.</p>}
      </section>
    </AdminShell>
  );
}

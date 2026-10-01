import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Protected } from "@/components/auth/protected";
import { VendorNotice, VendorPageHeading } from "@/components/vendor/vendor-shell";
import { applyForVendor, loadVendorAccess } from "@/lib/api/vendor";

export const Route = createFileRoute("/vendor/application")({ component: ApplicationRoute });

type ApplicationForm = {
  businessName: string;
  contactPhone: string;
  category: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
};

const EMPTY_FORM: ApplicationForm = {
  businessName: "",
  contactPhone: "",
  category: "",
  addressLine: "",
  city: "",
  state: "",
  pincode: "",
};

function ApplicationRoute() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    let alive = true;
    void loadVendorAccess()
      .then((result) => {
        if (!alive) return;
        if (result.success) setStatus(result.access.applicationStatus);
        else setError(result.message);
      })
      .catch(() => { if (alive) setError("Could not load your application status. Please refresh and try again."); });
    return () => { alive = false; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || status === "PENDING" || status === "APPROVED") return;
    setBusy(true);
    setError("");
    try {
      const result = await applyForVendor({ data: form });
      if (result.success) setStatus(result.status);
      else setError(result.message);
    } catch {
      setError("Could not submit your application. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Protected>
      <main className="container-page max-w-3xl py-12">
        <VendorPageHeading
          eyebrow="PrintHub partner program"
          title="Apply to become a vendor"
          description="Tell us about your shop. PrintHub Admin reviews every application and controls approval and verification."
        />
        {status === "PENDING" ? (
          <section className="card-surface mt-8 p-6">
            <h2 className="font-bold">Application under review</h2>
            <p className="mt-2 text-sm text-muted">We have received your shop details. The vendor workspace unlocks after Admin approval.</p>
          </section>
        ) : status === "APPROVED" ? (
          <section className="card-surface mt-8 p-6">
            <h2 className="font-bold">Application approved</h2>
            <p className="mt-2 text-sm text-muted">Your vendor workspace is ready.</p>
          </section>
        ) : (
          <>
            {status === "REJECTED" && (
              <div className="mb-5">
                <VendorNotice tone="warning">Your previous application was rejected. Update your details and submit a new application for review.</VendorNotice>
              </div>
            )}
            <form onSubmit={(event) => void submit(event)} className="card-surface mt-8 grid gap-4 p-6 sm:grid-cols-2">
              <ApplicationField label="Business / shop name" value={form.businessName} onChange={(businessName) => setForm({ ...form, businessName })} />
              <ApplicationField label="Contact phone" value={form.contactPhone} onChange={(contactPhone) => setForm({ ...form, contactPhone })} />
              <ApplicationField label="Shop category" value={form.category} onChange={(category) => setForm({ ...form, category })} />
              <ApplicationField label="Full address" value={form.addressLine} onChange={(addressLine) => setForm({ ...form, addressLine })} />
              <ApplicationField label="City" value={form.city} onChange={(city) => setForm({ ...form, city })} />
              <ApplicationField label="State" value={form.state} onChange={(state) => setForm({ ...form, state })} />
              <ApplicationField label="Pincode" value={form.pincode} onChange={(pincode) => setForm({ ...form, pincode })} />
              {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
              <div className="sm:col-span-2">
                <button className="btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
                <p className="mt-2 text-xs text-muted">Submitting does not grant Vendor privileges. Admin approval is required.</p>
              </div>
            </form>
          </>
        )}
      </main>
    </Protected>
  );
}

function ApplicationField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <span className="field mt-1"><input value={value} onChange={(event) => onChange(event.target.value)} required /></span>
    </label>
  );
}

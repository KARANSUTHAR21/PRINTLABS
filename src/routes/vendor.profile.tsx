import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VendorNotice, VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";
import { loadProfile, saveProfile } from "@/lib/api/commerce";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { Profile } from "@/lib/server/profile";

export const Route = createFileRoute("/vendor/profile")({ component: VendorProfileRoute });

function VendorProfileRoute() {
  const user = useCurrentUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadProfile()
      .then((result) => {
        if (!alive) return;
        if (result.success) setProfile(result.profile);
        else setError(result.message);
      })
      .catch(() => { if (alive) setError("Could not load your profile. Please refresh and try again."); });
    return () => { alive = false; };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await saveProfile({
        data: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone ?? undefined,
        },
      });
      if (result.success) {
        setProfile(result.profile);
        setMessage("Profile saved.");
      } else {
        setError(result.message);
      }
    } catch {
      setError("Could not save your profile. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <VendorShell>
      <VendorPageHeading
        eyebrow="Account"
        title="Vendor profile"
        description="Manage your personal PrintHub identity and contact information."
      />
      {!profile ? (
        <p className="py-10 text-sm text-muted">{error || "Loading profile…"}</p>
      ) : (
        <form onSubmit={(event) => void save(event)} className="card-surface grid max-w-3xl gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <VendorNotice>Email identity is managed by your authenticated PrintHub account. Password changes use the existing account security flow.</VendorNotice>
          </div>
          <ProfileField label="First name" value={profile.firstName} onChange={(firstName) => setProfile({ ...profile, firstName })} />
          <ProfileField label="Last name" value={profile.lastName} onChange={(lastName) => setProfile({ ...profile, lastName })} />
          <ProfileField label="Email" value={user?.primaryEmail ?? ""} disabled onChange={() => undefined} />
          <ProfileField label="Phone" value={profile.phone ?? ""} onChange={(phone) => setProfile({ ...profile, phone })} />
          {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
          {message && <p role="status" className="text-sm text-success sm:col-span-2">{message}</p>}
          <div className="sm:col-span-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
          </div>
        </form>
      )}
    </VendorShell>
  );
}

function ProfileField({ label, value, onChange, disabled = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <span className="field mt-1">
        <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

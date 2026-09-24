import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Protected } from "@/components/auth/protected";
import { loadProfile, saveProfile } from "@/lib/api/commerce";
import { authClient } from "@/lib/auth/client";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { Profile } from "@/lib/server/profile";

export const Route = createFileRoute("/profile")({ component: ProfileRoute });

function ProfileRoute() {
  return (
    <Protected>
      <ProfilePage />
    </Protected>
  );
}

function ProfilePage() {
  const user = useCurrentUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadProfile().then((res) => {
      if (res.success) setProfile(res.profile);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    const res = await saveProfile({ data: profile });
    setBusy(false);
    setMessage(res.success ? "Profile saved." : res.message);
    if (res.success) setProfile(res.profile);
  }

  if (!profile) return <main className="container-page py-20 text-sm text-muted">Loading profile...</main>;

  return (
    <main className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-extrabold">Profile</h1>
      <p className="mt-2 text-sm text-muted">
        Email: <span className="font-semibold text-ink">{user?.primaryEmail ?? profile.userId}</span>
        {" · "}Member since {new Date(profile.createdAt).toLocaleDateString("en-IN")}
      </p>
      <form className="mt-8 grid gap-4 sm:grid-cols-2" onSubmit={(e) => void submit(e)}>
        <Field label="First name" value={profile.firstName} onChange={(firstName) => setProfile({ ...profile, firstName })} />
        <Field label="Last name" value={profile.lastName} onChange={(lastName) => setProfile({ ...profile, lastName })} />
        <Field label="Phone" value={profile.phone ?? ""} onChange={(phone) => setProfile({ ...profile, phone })} />
        <Field label="City" value={profile.city ?? ""} onChange={(city) => setProfile({ ...profile, city })} />
        <div className="sm:col-span-2">
          <Field label="Address" value={profile.addressLine ?? ""} onChange={(addressLine) => setProfile({ ...profile, addressLine })} />
        </div>
        <Field label="PIN code" value={profile.pincode ?? ""} onChange={(pincode) => setProfile({ ...profile, pincode })} />
        <div className="flex items-end gap-4">
          <button type="submit" className="btn-navy" disabled={busy}>{busy ? "Saving..." : "Save profile"}</button>
          {message && <p className="text-sm text-muted">{message}</p>}
        </div>
      </form>
      <ChangePassword />
    </main>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Could not change password.");
      return;
    }
    setMessage("Password updated.");
    setCurrent("");
    setNext("");
  }

  return (
    <section className="card-surface mt-10 p-6">
      <h2 className="text-lg font-bold">Change password</h2>
      <form className="mt-4 grid max-w-md gap-4" onSubmit={(e) => void submit(e)}>
        <label className="block text-sm font-medium">
          Current password
          <span className="field mt-1">
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </span>
        </label>
        <label className="block text-sm font-medium">
          New password
          <span className="field mt-1">
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </span>
        </label>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm text-success" role="status">
            {message}
          </p>
        )}
        <button type="submit" className="btn-navy w-fit" disabled={busy}>
          {busy ? "Updating..." : "Update password"}
        </button>
      </form>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <span className="field mt-1">
        <input value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

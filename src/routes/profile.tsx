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

  /** Downscale to ≤256px JPEG so the data URL stays small; drop alpha via JPEG. */
  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!profile || !file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setMessage("Please choose a PNG or JPG image.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const scale = Math.min(1, size / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = URL.createObjectURL(file);
    }).catch(() => null);
    if (dataUrl) setProfile({ ...profile, photoUrl: dataUrl });
  }

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
      <div className="mt-6 flex items-center gap-5">
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt="Profile photo"
            className="size-20 rounded-full border border-line object-cover"
          />
        ) : (
          <span className="grid size-20 place-items-center rounded-full border border-line bg-canvas text-2xl font-bold text-muted">
            {(profile.firstName || user?.primaryEmail || "P").charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <label className="btn-outline cursor-pointer">
            {profile.photoUrl ? "Change photo" : "Add profile photo"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => void onPhotoChange(e)}
            />
          </label>
          {profile.photoUrl && (
            <button
              type="button"
              className="mt-2 block text-sm text-muted underline"
              onClick={() => setProfile({ ...profile, photoUrl: null })}
            >
              Remove photo
            </button>
          )}
          <p className="mt-1 text-xs text-muted">PNG or JPG, auto-resized to 256px. Save to apply.</p>
        </div>
      </div>
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

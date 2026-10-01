import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPageHeading, DeliveryShell } from "@/components/delivery/delivery-shell";
import { loadProfile, saveProfile } from "@/lib/api/commerce";
import type { Profile } from "@/lib/server/profile";

export const Route = createFileRoute("/delivery/profile")({ component: DeliveryProfileRoute });
function DeliveryProfileRoute() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void loadProfile().then((result) => { if (result.success) setProfile(result.profile); else setError(result.message); }).catch(() => setError("Could not load profile.")); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); if (!profile) return; setBusy(true); setError(""); setMessage(""); try { const result = await saveProfile({ data: profile }); if (!result.success) setError(result.message); else { setProfile(result.profile); setMessage("Profile saved."); } } catch { setError("Could not save profile."); } finally { setBusy(false); } }
  function field(key: "firstName" | "lastName" | "phone" | "addressLine" | "city" | "pincode", label: string) { return <label className="text-sm font-medium">{label}<input className="field mt-1 w-full" value={profile?.[key] ?? ""} onChange={(event) => profile && setProfile({ ...profile, [key]: event.target.value })} /></label>; }
  return <DeliveryShell><DeliveryPageHeading title="Profile" description="Your delivery profile is your own PrintHub account information." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}{profile ? <form className="card-surface grid max-w-2xl gap-4 p-6 sm:grid-cols-2" onSubmit={(event) => void save(event)}>{field("firstName", "First name")}{field("lastName", "Last name")}{field("phone", "Phone")}{field("city", "City")}<div className="sm:col-span-2">{field("addressLine", "Address")}</div>{field("pincode", "PIN code")}{message && <p role="status" className="self-end text-sm text-success">{message}</p>}<button className="btn-primary w-fit sm:col-span-2" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></form> : <p className="text-sm text-muted">Loading profile…</p>}</DeliveryShell>;
}

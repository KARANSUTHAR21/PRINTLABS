import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, MapPin, Save } from "lucide-react";
import { VendorNotice, VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";
import { loadVendorShop, saveVendorShop } from "@/lib/api/vendor";
import type { JsonRecord } from "@/lib/server/vendor";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type Day = (typeof DAYS)[number];
type DayHours = { closed: boolean; opensAt: string; closesAt: string };
type ShopForm = { name: string; description: string; phone: string; email: string; category: string; addressLine: string; city: string; state: string; pincode: string; latitude: string; longitude: string; isOpen: boolean; openingHours: Record<Day, DayHours> };
function emptyHours(): Record<Day, DayHours> { return Object.fromEntries(DAYS.map((day) => [day, { closed: true, opensAt: "09:00", closesAt: "18:00" }])) as Record<Day, DayHours>; }
function parseHours(value: unknown): Record<Day, DayHours> {
  const stored = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(DAYS.map((day) => {
    const match = typeof stored[day] === "string" ? /^((?:[01]\d|2[0-3]):[0-5]\d)-((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(stored[day] as string) : null;
    return [day, match && match[1] < match[2] ? { closed: false, opensAt: match[1], closesAt: match[2] } : { closed: true, opensAt: "09:00", closesAt: "18:00" }];
  })) as Record<Day, DayHours>;
}
const empty: ShopForm = { name: "", description: "", phone: "", email: "", category: "", addressLine: "", city: "", state: "", pincode: "", latitude: "", longitude: "", isOpen: false, openingHours: emptyHours() }; 
export const Route = createFileRoute("/vendor/shop")({ component: ShopRoute });
function ShopRoute() {
  const [shop, setShop] = useState<JsonRecord | null>(null); const [form, setForm] = useState(empty); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; void loadVendorShop().then((r) => { if (!alive) return; if (!r.success) { setError(r.message); return; } const s = r.shop; setShop(s); setForm({ name: String(s.name ?? ""), description: String(s.description ?? ""), phone: String(s.phone ?? ""), email: String(s.email ?? ""), category: String(s.category ?? ""), addressLine: String(s.address_line ?? ""), city: String(s.city ?? ""), state: String(s.state ?? ""), pincode: String(s.pincode ?? ""), latitude: s.latitude == null ? "" : String(s.latitude), longitude: s.longitude == null ? "" : String(s.longitude), isOpen: s.is_open === true, openingHours: parseHours(s.opening_hours) }); }).catch(() => { if (alive) setError("Could not load shop details."); }); return () => { alive = false; }; }, []);
  function set<K extends keyof ShopForm>(key: K, value: ShopForm[K]) { setForm((prev) => ({ ...prev, [key]: value })); }
  function setDayHours(day: Day, patch: Partial<DayHours>) { setForm((prev) => ({ ...prev, openingHours: { ...prev.openingHours, [day]: { ...prev.openingHours[day], ...patch } } })); }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const openingHours = Object.fromEntries(DAYS.map((day) => {
      const hours = form.openingHours[day];
      return [day, hours.closed ? "Closed" : `${hours.opensAt}-${hours.closesAt}`];
    }));
    try {
      const result = await saveVendorShop({ data: {
        name: form.name, description: form.description, phone: form.phone, email: form.email || null,
        category: form.category, addressLine: form.addressLine, city: form.city, state: form.state,
        pincode: form.pincode, latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null, openingHours, isOpen: form.isOpen,
      } });
      if (result.success) {
        setShop(result.shop);
        setMessage("Shop details saved.");
        setForm((prev) => ({ ...prev, isOpen: result.shop.is_open === true }));
      } else {
        setError(result.message);
      }
    } catch {
      setError("Could not save shop details. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <VendorShell><VendorPageHeading eyebrow="Shop Management" title="Shop Management" description="Manage your shop information, location, timings and customer visibility." action={<button form="shop-form" className="btn-primary" disabled={busy}><Save className="size-4" />{busy ? "Saving…" : "Save changes"}</button>} />{error && <VendorNotice tone="warning">{error}</VendorNotice>}{!shop ? <p className="py-12 text-sm text-muted">Loading shop information…</p> : <><div className="mb-5 grid gap-4 lg:grid-cols-[1fr_20rem]"><form id="shop-form" onSubmit={(e) => void save(e)} className="card-surface grid gap-4 p-5 sm:grid-cols-2 sm:p-6"><h2 className="text-lg font-bold sm:col-span-2">Basic information</h2><Field label="Shop name" value={form.name} onChange={(v) => set("name", v)} required /><Field label="Shop category" value={form.category} onChange={(v) => set("category", v)} required /><label className="block text-sm font-medium sm:col-span-2">Shop description<span className="field mt-1 min-h-24"><textarea className="w-full resize-y bg-transparent outline-none" rows={3} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} /></span></label><Field label="Phone number" value={form.phone} onChange={(v) => set("phone", v)} required /><Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} /><h2 className="mt-3 text-lg font-bold sm:col-span-2">Shop address</h2><Field label="Full address" value={form.addressLine} onChange={(v) => set("addressLine", v)} required /><Field label="City" value={form.city} onChange={(v) => set("city", v)} required /><Field label="State" value={form.state} onChange={(v) => set("state", v)} required /><Field label="Pincode" value={form.pincode} onChange={(v) => set("pincode", v)} required /><Field label="Latitude" type="number" value={form.latitude} onChange={(v) => set("latitude", v)} /><Field label="Longitude" type="number" value={form.longitude} onChange={(v) => set("longitude", v)} /><section className="sm:col-span-2"><h2 className="mb-3 mt-2 text-lg font-bold">Opening hours</h2><div className="divide-y divide-line rounded-lg border border-line px-4">{DAYS.map((day) => { const hours = form.openingHours[day]; return <div key={day} className="flex flex-wrap items-center gap-3 py-3"><span className="w-28 text-sm font-medium">{day}</span><label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={hours.closed} onChange={(e) => setDayHours(day, { closed: e.target.checked })} className="size-4 accent-primary" />Closed</label>{!hours.closed && <div className="flex items-center gap-2"><input aria-label={`${day} opening time`} type="time" className="field min-h-10 w-32 px-2 text-sm" value={hours.opensAt} onChange={(e) => setDayHours(day, { opensAt: e.target.value })} required /><span className="text-xs text-muted">to</span><input aria-label={`${day} closing time`} type="time" className="field min-h-10 w-32 px-2 text-sm" value={hours.closesAt} onChange={(e) => setDayHours(day, { closesAt: e.target.value })} required /></div>}</div>; })}</div></section>{message && <p role="status" className="text-sm text-success sm:col-span-2">{message}</p>}</form><div className="space-y-4"><section className="card-surface p-5"><h2 className="font-bold">Shop status</h2><p className="mt-2 text-sm font-semibold">{shop.active === true ? "Active" : "Inactive"} · {form.isOpen ? "Open" : "Closed"}</p><p className="mt-1 text-xs text-muted">An administrator controls shop activation.</p><label className="mt-4 flex items-center gap-3 border-t border-line pt-4 text-sm"><input type="checkbox" checked={form.isOpen} onChange={(e) => set("isOpen", e.target.checked)} disabled={shop.active !== true || shop.verified !== true || shop.subscription_active !== true} className="size-4 accent-primary" />Shop is open</label>{(shop.active !== true || shop.verified !== true || shop.subscription_active !== true) && <p className="mt-2 text-xs text-amber-800">Opening requires PrintHub activation, verification, and an active subscription.</p>}</section><section className="card-surface p-5"><h2 className="font-bold">Verification</h2><div className={`mt-3 rounded-lg p-4 ${shop.verified === true ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}><p className="flex items-center gap-2 font-semibold">{shop.verified === true ? <CheckCircle2 className="size-5" /> : <MapPin className="size-5" />}{shop.verified === true ? "Shop verified" : "Verification pending"}</p><p className="mt-1 text-xs">{shop.verified === true ? "Your verification status was set by PrintHub Admin." : "Only PrintHub Admin can verify your shop. You cannot change this status."}</p></div><dl className="mt-4 space-y-2 text-xs"><Row label="Verified on" value={shop.verified_at ? new Date(String(shop.verified_at)).toLocaleDateString("en-IN") : "—"} /><Row label="Verified by" value={String(shop.verified_by ?? "—")} /><Row label="Status" value={shop.verified === true ? "Verified" : "Not verified"} /></dl></section><VendorNotice>Shop images and cover image uploads require a media storage service, which is not connected yet. Opening hours are saved with your shop details.</VendorNotice></div></div></>}</VendorShell>;
}
function Field({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) { return <label className="block text-sm font-medium">{label}{required && <span className="text-danger"> *</span>}<span className="field mt-1"><input type={type} min={type === "number" && label === "Latitude" ? -90 : type === "number" && label === "Longitude" ? -180 : undefined} max={type === "number" && label === "Latitude" ? 90 : type === "number" && label === "Longitude" ? 180 : undefined} step={type === "number" ? "any" : undefined} value={value} onChange={(e) => onChange(e.target.value)} required={required} /></span></label>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>; }

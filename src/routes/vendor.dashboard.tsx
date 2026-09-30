import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Bell, Box, CircleAlert, Clock3, PackageCheck, Store, Wallet } from "lucide-react";
import { VendorNotice, VendorPageHeading, VendorShell } from "@/components/vendor/vendor-shell";
import { loadVendorDashboardFn } from "@/lib/api/vendor";
import { formatINR } from "@/lib/money";
import type { JsonRecord, VendorInventoryItem } from "@/lib/server/vendor";

type Dashboard = {
  shop: JsonRecord | null;
  inventory: { total_products: number; in_stock: number; low_stock: number; out_of_stock: number };
  subscription: { status: string; expires_at: string | null } | null;
  subscriptionActive: boolean;
  notificationsUnread: number;
  recentNotifications: { id: string; title: string; message: string; created_at: string }[];
  lowStockProducts: VendorInventoryItem[];
  today: { orders: number | null; salesPaise: number | null; pendingPickups: number | null };
  integrationNotice: string;
};

export const Route = createFileRoute("/vendor/dashboard")({ component: DashboardRoute });

function DashboardRoute() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void loadVendorDashboardFn()
      .then((result) => {
        if (!alive) return;
        if (result.success) setDashboard(result.dashboard);
        else setError(result.message);
      })
      .catch(() => { if (alive) setError("Could not load vendor dashboard."); });
    return () => { alive = false; };
  }, []);
  return <VendorShell>{error ? <VendorNotice tone="warning">{error}</VendorNotice> : !dashboard ? <p className="py-16 text-sm text-muted">Loading your shop…</p> : <DashboardContent dashboard={dashboard} />}</VendorShell>;
}

function DashboardContent({ dashboard }: { dashboard: NonNullable<Dashboard> }) {
  const shop = dashboard.shop;
  const name = String(shop?.name ?? "your shop");
  const verified = shop?.verified === true;
  const active = shop?.active === true;
  const isOpen = shop?.is_open === true;
  const inventory = dashboard.inventory;
  const stats = [
    { label: "Today's Orders", value: dashboard.today.orders ?? "—", detail: "Shop checkout not connected", icon: PackageCheck, tone: "bg-blue-50 text-blue-600" },
    { label: "Today's Sales", value: dashboard.today.salesPaise == null ? "—" : formatINR(dashboard.today.salesPaise), detail: "Paid order data unavailable", icon: Wallet, tone: "bg-emerald-50 text-emerald-600" },
    { label: "Pending Pickups", value: dashboard.today.pendingPickups ?? "—", detail: "Pickup flow not connected", icon: Clock3, tone: "bg-amber-50 text-amber-700" },
    { label: "Total Products", value: inventory.total_products, detail: `${inventory.in_stock} in stock`, icon: Box, tone: "bg-violet-50 text-violet-600" },
  ];
  return <>
    <VendorPageHeading eyebrow="Vendor workspace" title={`Welcome back, ${name}`} description="Here's the current health and readiness of your shop." action={<div className="text-right text-sm text-muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>} />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => { const Icon = stat.icon; return <div key={stat.label} className="card-surface flex items-center gap-4 p-4 sm:p-5"><span className={`grid size-12 shrink-0 place-items-center rounded-full ${stat.tone}`}><Icon className="size-5" /></span><div className="min-w-0"><p className="text-xs text-muted">{stat.label}</p><p className="mt-0.5 text-2xl font-extrabold">{stat.value}</p><p className="text-[0.7rem] text-muted">{stat.detail}</p></div></div>; })}</div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatusCard title="Shop status" status={active ? (isOpen ? "Open" : "Closed") : "Inactive"} ok={active && isOpen} detail={active ? (isOpen ? "Visible to customers" : "Not receiving orders") : "Awaiting activation by PrintHub"} icon={Store} />
      <StatusCard title="Verification" status={verified ? "Verified" : "Not verified"} ok={verified} detail={verified ? `Verified ${shop?.verified_at ? new Date(String(shop.verified_at)).toLocaleDateString("en-IN") : "by PrintHub"}` : "Admin review required before the shop can open"} icon={CircleAlert} />
      <StatusCard title="New orders" status={active && verified && isOpen && dashboard.subscriptionActive ? "Eligible" : "Unavailable"} ok={active && verified && isOpen && dashboard.subscriptionActive} detail={!dashboard.subscriptionActive ? "An active subscription is required" : "Requires active, verified, open shop"} icon={Activity} />
      <StatusCard title="Subscription" status={dashboard.subscription?.status ?? "No active plan"} ok={dashboard.subscriptionActive} detail={dashboard.subscription?.expires_at ? `Expires ${new Date(dashboard.subscription.expires_at).toLocaleDateString("en-IN")}` : "No currently active subscription"} icon={Wallet} />
    </div>

    <div className="mb-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
      <section className="card-surface p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Sales overview</h2><p className="mt-1 text-sm text-muted">Real paid sales will appear when shop-scoped checkout is integrated.</p></div><span className="rounded-full bg-mist px-3 py-1 text-xs text-muted">This week</span></div><div className="mt-7 grid min-h-44 place-items-center rounded-xl border border-dashed border-line bg-canvas/70 p-5 text-center"><div><Activity className="mx-auto size-8 text-muted-2" /><p className="mt-2 text-sm font-semibold">No shop sales data yet</p><p className="text-xs text-muted">Customer orders still use the existing global catalog.</p></div></div></section>
      <section className="card-surface p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Inventory health</h2><p className="text-sm text-muted">Your shop listings</p></div><Link to="/vendor/inventory" className="link-blue text-sm">View all <ArrowRight className="inline size-4" /></Link></div><div className="mt-5 space-y-3">{[["Total products", inventory.total_products], ["In stock", inventory.in_stock], ["Low stock", inventory.low_stock], ["Out of stock", inventory.out_of_stock]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between border-b border-line-soft pb-2 text-sm last:border-0"><span className="text-muted">{label}</span><strong>{value}</strong></div>)}</div>{dashboard.lowStockProducts.length > 0 && <div className="mt-3 space-y-2">{dashboard.lowStockProducts.slice(0, 4).map((product) => <div key={product.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs"><span className="truncate font-semibold">{product.name}</span><span className="shrink-0 text-amber-800">{product.available_quantity} left</span></div>)}</div>}</section>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="card-surface p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-blue-50 text-primary"><Store className="size-5" /></span><div><h2 className="font-bold">Shop readiness</h2><p className="text-xs text-muted">Activation, verification and subscription all control new orders.</p></div></div><div className="mt-4 space-y-3"><ReadinessItem label="Shop active" ok={active} /><ReadinessItem label="Admin verified" ok={verified} /><ReadinessItem label="Subscription active" ok={dashboard.subscriptionActive} /><ReadinessItem label="Shop open" ok={isOpen} /></div><Link to="/vendor/shop" className="btn-outline mt-5 w-full">Manage shop details</Link></section>
      <section className="card-surface p-5 sm:p-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-violet-50 text-violet-600"><Bell className="size-5" /></span><div><h2 className="font-bold">Recent notifications</h2><p className="text-xs text-muted">{dashboard.notificationsUnread} unread</p></div></div><a href="/vendor/notifications" className="link-blue text-sm">View all</a></div><div className="mt-4 space-y-2">{dashboard.recentNotifications.length > 0 ? dashboard.recentNotifications.map((notification) => <article key={notification.id} className="rounded-lg bg-canvas p-3"><p className="text-sm font-semibold">{notification.title}</p><p className="mt-1 text-xs text-muted">{notification.message}</p><p className="mt-1 text-[0.68rem] text-muted">{new Date(notification.created_at).toLocaleString("en-IN")}</p></article>) : <div className="rounded-lg bg-canvas p-4 text-sm text-muted">No notifications yet.</div>}</div><h3 className="mt-5 text-sm font-bold">Quick actions</h3><div className="mt-3 grid gap-2 sm:grid-cols-2"><Link to="/vendor/inventory/add" className="btn-primary">Add product</Link><Link to="/vendor/inventory/stock" className="btn-outline">Update stock</Link><a href="/vendor/orders" className="btn-outline">View orders</a><a href="/vendor/subscription" className="btn-outline">Subscription</a></div></section>
    </div>
    <VendorNotice tone="info"><strong>Order integration in progress.</strong> {dashboard.integrationNotice} Your vendor listings and stock are managed separately and do not alter existing global catalog products or customer payments.</VendorNotice>
  </>;
}

function StatusCard({ title, status, detail, ok, icon: Icon }: { title: string; status: string; detail: string; ok: boolean; icon: typeof Store }) { return <div className="card-surface p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs text-muted">{title}</p><Icon className={`size-4 ${ok ? "text-success" : "text-amber-600"}`} /></div><p className={`mt-2 font-bold ${ok ? "text-success" : "text-amber-700"}`}>{status}</p><p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p></div>; }
function ReadinessItem({ label, ok }: { label: string; ok: boolean }) { return <div className="flex items-center justify-between text-sm"><span>{label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{ok ? "Ready" : "Required"}</span></div>; }

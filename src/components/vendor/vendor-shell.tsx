import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import {
  Bell, Box, BriefcaseBusiness, ChartNoAxesCombined, ChevronDown, CircleHelp,
  ClipboardList, FileText, Home, ScanLine, Settings, ShieldCheck, Store, UserRound, Wallet,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loadVendorAccess } from "@/lib/api/vendor";
import type { VendorAccess } from "@/lib/server/vendor";
import { cn } from "@/lib/utils";
import { RoleProtected } from "@/components/auth/role-protected";

type NavItem = { label: string; to: string; icon: LucideIcon; children?: readonly (readonly [string, string])[] };

const NAV: readonly NavItem[] = [
  { label: "Dashboard", to: "/vendor/dashboard", icon: Home },
  { label: "Shop Management", to: "/vendor/shop", icon: Store },
  { label: "Vendor Approvals", to: "/vendor/admin", icon: ShieldCheck },
  { label: "Inventory", to: "/vendor/inventory", icon: Box, children: [
    ["All Products", "/vendor/inventory"], ["Add Product", "/vendor/inventory/add"],
    ["Stock Update", "/vendor/inventory/stock"], ["Low Stock", "/vendor/inventory/low-stock"],
    ["Stock History", "/vendor/inventory/history"],
  ] },
  { label: "Orders", to: "/vendor/orders", icon: ClipboardList },
  { label: "Pickup Verification", to: "/vendor/pickup", icon: ScanLine },
  { label: "Customers", to: "/vendor/customers", icon: UserRound },
  { label: "Receipts", to: "/vendor/receipts", icon: FileText, children: [
    ["Product Receipts", "/vendor/receipts"], ["Subscription Receipts", "/vendor/receipts/subscriptions"],
  ] },
  { label: "Subscription", to: "/vendor/subscription", icon: ShieldCheck, children: [
    ["Overview", "/vendor/subscription"], ["Plans & Billing", "/vendor/subscription/plans"],
    ["Payment History", "/vendor/subscription/payment-history"],
  ] },
  { label: "Bank & Payment Details", to: "/vendor/payment-details", icon: Wallet },
  { label: "Sales & Analytics", to: "/vendor/sales", icon: ChartNoAxesCombined },
  { label: "Notifications", to: "/vendor/notifications", icon: Bell },
  { label: "Profile", to: "/vendor/profile", icon: UserRound },
  { label: "Settings", to: "/vendor/settings", icon: Settings },
  { label: "Support", to: "/vendor/support", icon: CircleHelp },
];

export function VendorShell({ children }: { children: ReactNode }) {
  return <RoleProtected allowedRoles={["USER", "VENDOR", "ADMIN"]}><VendorShellContent>{children}</VendorShellContent></RoleProtected>;
}

function VendorShellContent({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [access, setAccess] = useState<VendorAccess | null>(null);
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setAccess(null);
    setVerifiedFor(null);
    setFailed(false);
    if (!userId) return;
    let alive = true;
    void loadVendorAccess().then((result) => {
      if (!alive) return;
      setVerifiedFor(userId);
      if (result.success) setAccess(result.access);
      else setFailed(true);
    }).catch(() => { if (alive) { setVerifiedFor(userId); setFailed(true); } });
    return () => { alive = false; };
  }, [userId]);

  if (isPending || (user && (verifiedFor !== userId || (!access && !failed)))) {
    return <main className="container-page py-24 text-sm text-muted">Loading vendor workspace…</main>;
  }
  if (!user) return <Navigate to="/login" search={{ next: pathname }} />;
  if (failed) return <main className="container-page py-20"><div className="card-surface max-w-xl p-8"><h1 className="text-2xl font-bold">Vendor workspace unavailable</h1><p className="mt-3 text-sm text-muted">We could not verify your account permissions. Please refresh or contact support.</p></div></main>;
  if (access?.role === "USER" && pathname !== "/vendor/application") return <Navigate to="/vendor/application" />;
  if (access?.role === "USER") return <>{children}</>;
  if (access?.role !== "VENDOR" && access?.role !== "ADMIN") return <Navigate to="/" />;
  if (access.role === "ADMIN" && pathname !== "/vendor/admin") return <Navigate to="/vendor/admin" />;
  if (access.role === "VENDOR" && pathname === "/vendor/admin") return <Navigate to="/vendor/dashboard" />;

  const shopName = access.shopName ?? user.displayName ?? "PrintHub Vendor";
  return (
    <div className="min-h-[calc(100vh-1px)] bg-canvas lg:flex">
      <aside className="z-30 flex w-full flex-col bg-navy text-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0">
        <div className="flex h-[4.6rem] items-center justify-between border-b border-white/10 px-5">
          <a href="/vendor/dashboard" aria-label="PrintHub vendor dashboard"><Logo className="text-[1.8rem] text-white" /></a>
          <button type="button" className="grid size-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 lg:hidden" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Toggle vendor menu"><ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} /></button>
        </div>
        <nav className={cn("max-h-[45vh] overflow-y-auto p-2 lg:max-h-none lg:flex-1", !open && "hidden lg:block")} aria-label="Vendor navigation">
          {NAV.filter((item) => access.role === "ADMIN"
            ? item.label === "Vendor Approvals"
            : item.label !== "Vendor Approvals").map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || (item.to !== "/vendor/dashboard" && pathname.startsWith(`${item.to}/`));
            return <div key={item.label} className="mb-1">
              <a href={item.to} className={cn("flex min-h-10 items-center gap-3 rounded-lg px-3 text-[0.84rem] font-medium transition-colors", active ? "bg-primary text-white" : "text-white/90 hover:bg-white/10")}>
                <Icon className="size-[1.1rem] shrink-0" aria-hidden /><span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.label === "Notifications" && access.unreadNotifications > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[0.65rem] font-bold">{access.unreadNotifications}</span>}
                {item.children && <ChevronDown className="size-4 shrink-0 text-white/60" />}
              </a>
              {item.children && (active || pathname.startsWith(item.to)) && <div className="ml-3 mt-1 border-l border-white/15 pl-3">
                {item.children.map(([label, to]) => <a key={to} href={to} className={cn("mb-0.5 block rounded-md px-3 py-1.5 text-xs text-white/75 hover:bg-white/10 hover:text-white", pathname === to.split("?")[0] && "bg-white/10 text-white")}>{label}</a>)}
              </div>}
            </div>;
          })}
        </nav>
        <div className="m-3 hidden rounded-xl border border-white/10 bg-white/5 p-3 lg:block">
          <p className="text-xs font-semibold">Need help?</p><p className="mt-1 text-xs leading-relaxed text-white/70">Contact PrintHub Support for assistance.</p>
          <a href="/vendor/support" className="mt-3 inline-flex items-center gap-2 rounded-md border border-white/40 px-3 py-2 text-xs font-semibold hover:bg-white/10"><BriefcaseBusiness className="size-3.5" />Contact Support</a>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[4.6rem] items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div><Logo className="text-2xl" /><p className="hidden text-[0.68rem] text-muted sm:block">Print · Copy · Scan · Stationery · All in One</p></div>
          <div className="flex items-center gap-4"><span className="hidden text-right sm:block"><span className="block max-w-48 truncate text-sm font-bold">{shopName}</span><span className="text-xs text-muted">{access.role === "ADMIN" ? "Administrator" : "Vendor"}</span></span><div className="w-32"><UserButton /></div></div>
        </header>
        <main className="min-h-[calc(100vh-4.6rem)] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function VendorPageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow && <p className="text-xs font-semibold text-muted">{eyebrow}</p>}<h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-muted sm:text-base">{description}</p></div>{action}</div>;
}

export function VendorNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" | "success" }) {
  const color = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-100 bg-blue-50 text-blue-900";
  return <div className={cn("rounded-xl border p-4 text-sm leading-relaxed", color)}>{children}</div>;
}

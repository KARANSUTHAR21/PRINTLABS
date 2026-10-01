import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RoleProtected } from "@/components/auth/role-protected";
import { UserButton } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";

const DELIVERY_NAV = [
  ["Dashboard", "/delivery/dashboard"],
  ["Assigned orders", "/delivery/orders"],
  ["History", "/delivery/history"],
  ["Earnings", "/delivery/earnings"],
  ["Notifications", "/delivery/notifications"],
  ["Profile", "/delivery/profile"],
  ["Settings", "/delivery/settings"],
] as const;

export function DeliveryShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <RoleProtected allowedRoles={["DELIVERY_PARTNER"]}>
      <div className="min-h-screen bg-canvas lg:flex">
        <aside className="w-full shrink-0 bg-navy text-white lg:sticky lg:top-0 lg:h-screen lg:w-60">
          <div className="border-b border-white/10 px-5 py-5">
            <Link to="/delivery/dashboard" className="text-xl font-extrabold text-white">PrintHub Delivery</Link>
            <p className="mt-1 text-xs text-white/65">Partner workspace</p>
          </div>
          <nav className="grid max-h-[38vh] gap-1 overflow-y-auto p-3 lg:max-h-[calc(100vh-9rem)]" aria-label="Delivery partner navigation">
            {DELIVERY_NAV.map(([label, to]) => {
              const active = to === "/delivery/dashboard" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
              return <Link key={to} to={to} className={cn("rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-primary text-white" : "text-white/80 hover:bg-white/10 hover:text-white")}>{label}</Link>;
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex min-h-[4.5rem] items-center justify-between border-b border-line bg-paper px-5 sm:px-8">
            <p className="font-semibold">Delivery partner workspace</p>
            <div className="w-40"><UserButton /></div>
          </header>
          <main className="container-page py-8 sm:py-10">{children}</main>
        </div>
      </div>
    </RoleProtected>
  );
}

export function DeliveryPageHeading({ title, description }: { title: string; description: string }) {
  return <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Delivery operations</p><h1 className="mt-1 text-3xl font-extrabold">{title}</h1><p className="mt-2 max-w-3xl text-sm text-muted">{description}</p></div>;
}

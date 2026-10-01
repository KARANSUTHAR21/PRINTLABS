import type { ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { roleCanAccessPath, type AppRole } from "@/lib/auth/roles";
import { useEffect, useState } from "react";
import { loadCurrentRole } from "@/lib/api/roles";

export function RoleProtected({ children, allowedRoles }: { children: ReactNode; allowedRoles: readonly AppRole[] }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [access, setAccess] = useState<{ role: AppRole; accountType: "CUSTOMER" | "VENDOR"; accountTypeSelected: boolean } | null>(null);
  const [checking, setChecking] = useState(true);
  const userId = user?.id;
  useEffect(() => {
    let alive = true;
    setChecking(true);
    setAccess(null);
    if (!userId) { setChecking(false); return () => { alive = false; }; }
    void loadCurrentRole().then((result) => {
      if (!alive) return;
      setAccess(result.success ? { role: result.role, accountType: result.accountType, accountTypeSelected: result.accountTypeSelected } : null);
      setChecking(false);
    }).catch(() => { if (alive) { setAccess(null); setChecking(false); } });
    return () => { alive = false; };
  }, [userId]);
  if (isPending || checking) return <main className="container-page py-24 text-sm text-muted">Checking account permissions…</main>;
  if (!user) return <Navigate to="/login" search={{ next: pathname }} />;
  const accountTypeAllowsRoute = access?.role !== "USER" || (
    !access.accountTypeSelected ? pathname === "/register"
      : pathname === "/vendor/application" ? access.accountType === "VENDOR" : access.accountType === "CUSTOMER"
  );
  if (access && access.role === "USER" && !access.accountTypeSelected && pathname !== "/register") {
    return <Navigate to="/register" search={{ socialCallback: "1", next: pathname }} />;
  }
  if (!access || !allowedRoles.includes(access.role) || !roleCanAccessPath(access.role, pathname) || !accountTypeAllowsRoute) return <main className="container-page py-24"><h1 className="text-2xl font-bold">Access denied</h1><p className="mt-2 text-sm text-muted">This route is not available for your account type.</p></main>;
  return <>{children}</>;
}

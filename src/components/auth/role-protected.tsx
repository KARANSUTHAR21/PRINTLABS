import type { ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { roleCanAccessPath, type AppRole } from "@/lib/auth/roles";
import { useEffect, useState } from "react";
import { loadCurrentRole } from "@/lib/api/roles";

export function RoleProtected({ children, allowedRoles }: { children: ReactNode; allowedRoles: readonly AppRole[] }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [role, setRole] = useState<AppRole | null>(null);
  const [checking, setChecking] = useState(true);
  const userId = user?.id;
  useEffect(() => {
    let alive = true;
    setChecking(true);
    setRole(null);
    if (!userId) { setChecking(false); return () => { alive = false; }; }
    void loadCurrentRole().then((result) => {
      if (!alive) return;
      setRole(result.success ? result.role : null);
      setChecking(false);
    }).catch(() => { if (alive) { setRole(null); setChecking(false); } });
    return () => { alive = false; };
  }, [userId]);
  if (isPending || checking) return <main className="container-page py-24 text-sm text-muted">Checking account permissions…</main>;
  if (!user) return <Navigate to="/login" search={{ next: pathname }} />;
  if (!role || !allowedRoles.includes(role) || !roleCanAccessPath(role, pathname)) return <main className="container-page py-24"><h1 className="text-2xl font-bold">Access denied</h1><p className="mt-2 text-sm text-muted">This route is not available for your account role.</p></main>;
  return <>{children}</>;
}

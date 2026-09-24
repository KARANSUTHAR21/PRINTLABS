import { useRef, type ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { safeNextPath } from "@/lib/utils";

/**
 * Gate for authenticated-only pages. While the session is resolving we render
 * a neutral loading state (never a redirect — the visitor would bounce to
 * sign-in on every hard reload). Once definitely signed out, redirect to
 * /login carrying the page they wanted, sanitized:
 *
 * - The target is captured ONCE (ref). Reading the reactive pathname on every
 *   render races the redirect itself: a re-render after the navigation commits
 *   but before this component unmounts sees /login and would produce the
 *   self-referential `/login?next=/login`, losing the intended destination.
 * - `safeNextPath` rejects anything that isn't an in-app path and never lets
 *   the next hop be the login/register pages themselves.
 */
export function Protected({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nextRef = useRef<string | null>(null);

  if (isPending) {
    return <div className="container-page py-24 text-sm text-muted">Loading your account…</div>;
  }
  if (!user) {
    if (nextRef.current === null) {
      nextRef.current = safeNextPath(pathname);
    }
    return <Navigate to="/login" search={{ next: nextRef.current }} />;
  }
  return <>{children}</>;
}

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { GROK_PROVIDERS, authEnabled, signIn, signOut } from "./client";
import { hasGateSessionMarker } from "./gate-session-marker";
import { resolveSignInGateState } from "./sign-in-gate";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

/**
 * Auth state components — plain wrappers around `useCurrentUserState()`.
 *
 * With auth on, visitors are signed out until they authenticate — in the sandbox
 * live preview too, which does real sign-in. The shared dev user appears only
 * when auth is disabled (`VITE_AUTH_ENABLED=false`, the shipped default).
 * While the session is still resolving, gates that care about signed-out state
 * render nothing so there's no signed-out flash on hard reload.
 */

/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
export const SIGN_IN_PATH = "/login";

/** Render children only when a user is present (real session, or the disabled-auth dev user). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

/**
 * Render children only once we KNOW the visitor is signed out (`isPending` has
 * cleared and there is no user). Hidden while the session is still loading.
 */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

/**
 * Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
 * `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
 * session loading, which feels like a second "Loading…" on /login.
 *
 * Guard routes by waiting out `isPending` first (see `use-current-user`), then
 * render this.
 */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

export function SignInGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, isPending } = useCurrentUserState();
  const state = resolveSignInGateState({ isPending, hasUser: user !== null });
  if (state === "pending") return null;
  if (state === "signed_in") return <>{children}</>;
  return <>{fallback ?? <SignInButtons />}</>;
}

export function SignInButtons() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {GROK_PROVIDERS.map((p) => (
        <button
          key={p.providerId}
          type="button"
          onClick={() => signIn(p.providerId, { callbackURL: "/" })}
          className="w-full cursor-pointer rounded-md border border-neutral-300 px-4 py-2 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Continue with {p.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Signed-in identity chip + a full-width **Logout button**.
 *
 * The button closes the session for real, in whichever mode the app runs:
 * - **Bearer-token session** (live preview / stripped-cookie dev): revokes the
 *   token server-side AND removes it from `sessionStorage` (`signOut()` in
 *   `./client` → `runSignOut`) — an expired/removed token is unusable, which is
 *   the JWT expiry the logout promises.
 * - **Cookie session** (deployed): Better Auth's sign-out endpoint terminates
 *   the server session and clears the `__Host-` cookie. The call is confirmed
 *   before any redirect — a failed or timed-out sign-out throws instead of
 *   pretending, so the button surfaces a retryable error rather than a lie.
 * A gate-materialized session hides the button: the next request would sign
 * the viewer straight back in, making logout a broken loop.
 */
export function UserButton() {
  const user = useCurrentUser();
  // Sign-out can take a moment (and can fail when deployed), so the control
  // shows it is working, cannot be fired twice, and reports failure for retry.
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";

  const handleSignOut = () => {
    setSigningOut(true);
    setError(null);
    // Success navigates away (runSignOut redirects); on failure re-enable and
    // show why, so the session-ending step can be retried.
    signOut()
      .catch((err: unknown) => {
        setSigningOut(false);
        setError(err instanceof Error ? err.message : "Logout failed — try again.");
      });
  };

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center gap-2">
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-canvas text-sm font-bold text-ink">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="truncate text-sm font-medium text-ink">{label}</span>
      </div>
      {authEnabled && !gateSession && (
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-busy={signingOut}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-canvas px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-mist disabled:cursor-wait disabled:opacity-60"
        >
          <LogOut className="size-4" aria-hidden />
          {signingOut ? "Logging out…" : "Log out"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs leading-snug text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

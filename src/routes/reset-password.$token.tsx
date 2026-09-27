import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, ShieldAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { checkResetLink, confirmReset } from "@/lib/api/public";
import { PASSWORD_HINT, passwordProblem } from "@/lib/password";
import { RESET_LINK_TTL_MINUTES } from "@/lib/reset-link";

export const Route = createFileRoute("/reset-password/$token")({ component: ResetPasswordRoute });

function ResetPasswordRoute() {
  const { token } = useParams({ from: "/reset-password/$token" });
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  /** The link is stale/used/malformed — offer a fresh one instead of a retry. */
  const [linkDead, setLinkDead] = useState(false);
  /** True until the link has been validated server-side. */
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  // Tell someone following a dead link straight away, rather than after they
  // have typed and submitted a new password they cannot use.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await checkResetLink({ data: { token } });
        if (cancelled) return;
        if (result.success && !result.valid) {
          setError("This reset link is invalid or has expired.");
          setLinkDead(true);
        }
      } catch {
        // Could not check — fall through to the form; submitting will surface
        // the real reason.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = await confirmReset({ data: { token, password } });
      if (!result.success) {
        if (result.code === "EXPIRED") setLinkDead(true);
        setError(result.message);
        return;
      }
      setMessage(result.message);
      // The account is ready: hand off to login with a success notice rather
      // than leaving the user on a form whose only action is now a no-op.
      await navigate({ to: "/login", search: { next: "/", reset: "done" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      photo="/images/auth-shop.jpg"
      photoTitle={
        <>
          Choose
          <br />
          a New
          <br />
          Password
        </>
      }
      photoBody="Reset. Log in. Keep creating."
      features={[
        { icon: "shield", title: "Protected", hint: "Hashed tokens" },
        { icon: "clock", title: "One-time", hint: "Single use" },
        { icon: "users", title: "Fast", hint: "Sign in again" },
      ]}
    >
      <h1 className="text-[1.9rem] font-extrabold">Create a New Password</h1>
      <p className="mt-2 text-[0.95rem] text-muted">{PASSWORD_HINT}</p>

      {checking ? (
        <p className="mt-7 text-[0.95rem] text-muted" role="status">
          Checking your reset link…
        </p>
      ) : linkDead ? (
        <div className="mt-7 space-y-7">
          <p
            className="flex items-start gap-3 rounded-xl border border-line bg-canvas px-4 py-3 text-[0.95rem] text-ink"
            role="alert"
          >
            <ShieldAlert className="mt-0.5 size-[1.15rem] shrink-0 text-danger" strokeWidth={1.8} />
            <span>
              {error || "This reset link is invalid or has expired."} Reset links are single-use and
              last {RESET_LINK_TTL_MINUTES} minutes.
            </span>
          </p>
          <Link to="/forgot-password" className="btn-primary w-full">
            Request a new link
          </Link>
          <p className="text-center text-[0.9rem] text-muted">
            <Link to="/login" search={{ next: "/" }} className="font-semibold text-primary">
              Back to Login
            </Link>
          </p>
        </div>
      ) : (
        <form className="mt-7 space-y-5" onSubmit={(event) => void submit(event)}>
          <label className="block">
            <span className="block text-[0.9rem] font-semibold text-ink">New Password</span>
            <span className="field mt-2">
              <Lock className="size-[1.15rem]" strokeWidth={1.7} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
              />
              <button
                type="button"
                className="text-muted-2"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOff className="size-[1.15rem]" strokeWidth={1.7} />
                ) : (
                  <Eye className="size-[1.15rem]" strokeWidth={1.7} />
                )}
              </button>
            </span>
          </label>
          <label className="block">
            <span className="block text-[0.9rem] font-semibold text-ink">Confirm New Password</span>
            <span className="field mt-2">
              <Lock className="size-[1.15rem]" strokeWidth={1.7} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm your password"
                autoComplete="new-password"
                minLength={8}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
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
          <button type="submit" className="btn-primary w-full" disabled={busy || Boolean(message)}>
            {busy ? "Updating…" : "Update Password"}
          </button>
        </form>
      )}

      {!linkDead && !checking && (
        <p className="mt-6 text-center text-[0.9rem] text-muted">
          <Link to="/login" search={{ next: "/" }} className="font-semibold text-primary">
            Back to Login
          </Link>
        </p>
      )}
    </AuthShell>
  );
}

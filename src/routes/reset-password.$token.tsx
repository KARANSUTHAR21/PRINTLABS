import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { confirmReset } from "@/lib/api/public";

export const Route = createFileRoute("/reset-password/$token")({ component: ResetPasswordRoute });

function ResetPasswordRoute() {
  const { token } = useParams({ from: "/reset-password/$token" });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const result = await confirmReset({ data: { token, password } });
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
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
      <p className="mt-2 text-[0.95rem] text-muted">
        Use at least eight characters and keep it somewhere safe.
      </p>
      <form className="mt-7 space-y-5" onSubmit={(event) => void submit(event)}>
        <label className="block">
          <span className="block text-[0.9rem] font-semibold text-ink">New Password</span>
          <span className="field mt-2">
            <Lock className="size-[1.15rem]" strokeWidth={1.7} />
            <input
              type="password"
              placeholder="Create a password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </span>
        </label>
        <label className="block">
          <span className="block text-[0.9rem] font-semibold text-ink">Confirm New Password</span>
          <span className="field mt-2">
            <Lock className="size-[1.15rem]" strokeWidth={1.7} />
            <input
              type="password"
              placeholder="Confirm your password"
              autoComplete="new-password"
              minLength={8}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </span>
        </label>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        {message && <p className="text-sm text-success" role="status">{message}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy || Boolean(message)}>
          {busy ? "Updating…" : "Update Password"}
        </button>
      </form>
      <p className="mt-6 text-center text-[0.9rem] text-muted">
        <Link to="/login" search={{ next: "/" }} className="font-semibold text-primary">Back to Login</Link>
      </p>
    </AuthShell>
  );
}

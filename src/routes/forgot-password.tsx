import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Link2, Lock, Mail, RefreshCw } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { requestReset } from "@/lib/api/public";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordRoute });

const STEPS = [
  {
    icon: Mail,
    title: "1. Enter your email",
    body: "We'll send you a reset link.",
  },
  {
    icon: Link2,
    title: "2. Click the link",
    body: "Open the email and click the link to reset your password.",
  },
  {
    icon: Lock,
    title: "3. Create a new password",
    body: "Set a new password and you're all set!",
  },
];

function ForgotPasswordRoute() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /** Shared by the initial send and the "resend" button. */
  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestReset({ data: { email: email.trim() } });
      if (!result.success) {
        setError(result.message);
        return;
      }
      // The server's answer is intentionally generic (it never reveals whether
      // the address has an account), so the UI must not imply one either.
      setMessage(result.message);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      photo="/images/auth-shop.jpg"
      photoTitle={
        <>
          Good
          <br />
          Ideas
          <br />
          Get Printed
          <br />
          Here.
        </>
      }
      photoBody="Reset. Log in. Keep creating."
      features={[
        { icon: "clock", title: "Quick & Easy", hint: "Get back to printing" },
        { icon: "shield", title: "Secure & Private", hint: "Your data stays safe" },
        { icon: "users", title: "Always Here", hint: "Support when you need it" },
      ]}
    >
      <h1 className="text-[2.4rem] font-bold tracking-tight">Forgot Password?</h1>
      <p className="mt-3 text-[1.05rem] text-muted">
        No worries! We'll help you get back to your account.
      </p>
      <ul className="mt-9 space-y-[1.15rem]">
        {STEPS.map((step) => (
          <li key={step.title} className="flex items-center gap-5">
            <span className="icon-badge">
              <step.icon className="size-[1.35rem]" strokeWidth={1.7} />
            </span>
            <span>
              <span className="block text-[0.95rem] font-bold text-ink">{step.title}</span>
              <span className="mt-1.5 block text-[0.9rem] leading-snug text-muted">
                {step.body}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {sent ? (
        <div className="mt-11 space-y-6">
          <p
            className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-[0.95rem] text-ink"
            role="status"
          >
            {message}
          </p>
          <p className="text-[0.95rem] text-muted">
            Sent to <strong className="text-ink">{email.trim()}</strong>. The link is valid for 30
            minutes and can only be used once.
          </p>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="btn-outline w-full"
              onClick={() => void send()}
              disabled={busy}
            >
              <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
              {busy ? "Sending…" : "Resend link"}
            </button>
            <button
              type="button"
              className="text-[0.9rem] font-semibold text-muted underline"
              onClick={() => {
                setSent(false);
                setMessage("");
                setError("");
              }}
            >
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        <form className="mt-11 space-y-7" onSubmit={(event) => void send(event)}>
          <label className="block">
            <span className="field-label block">Email Address</span>
            <span className="field mt-3">
              <Mail className="size-[1.15rem]" strokeWidth={1.7} />
              <input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </span>
          </label>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary mt-8 w-full" disabled={busy}>
            {busy ? (
              "Sending…"
            ) : (
              <>
                Send Reset Link
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>
      )}

      <p className="mt-9 text-center">
        <Link
          to="/login"
          search={{ next: "/" }}
          className="inline-flex items-center gap-2 text-[0.95rem] font-semibold text-primary"
        >
          <ArrowLeft className="size-4" />
          Back to Login
        </Link>
      </p>
    </AuthShell>
  );
}

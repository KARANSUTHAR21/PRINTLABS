import { useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SocialButtons } from "@/components/auth/social-buttons";
import { authClient, storeSessionToken } from "@/lib/auth/client";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { safeNextPath } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : "/",
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const { next } = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const callbackURL = next || "/";
    try {
      const result = await authClient.signIn.email({ email, password, callbackURL });
      if (result.error) throw new Error(result.error.message ?? "Could not sign in.");
      // When the environment could not persist the session cookie, keep the
      // session alive with the returned bearer token (see storeSessionToken).
      storeSessionToken(result.data?.token);
      await navigate({ to: safeNextPath(callbackURL) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      photo="/images/auth-shop.jpg"
      photoTitle={
        <>
          Print
          <br />
          Create
          <br />
          Organize
          <br />
          Achieve
        </>
      }
      photoBody="Same Community Bigger Possibilities."
      features={[
        { icon: "truck", title: "Fast & Reliable", hint: "Get your prints faster" },
        { icon: "shield", title: "Trusted Quality", hint: "Professional results" },
        { icon: "leaf", title: "A Greener Tomorrow", hint: "Print smarter, together" },
      ]}
      quote="Good Ideas Get Printed."
    >
      <h1 className="text-[2.4rem] font-bold tracking-tight">Welcome Back</h1>
      <p className="mt-3 text-[1.05rem] text-muted">Login to your PrintHub account</p>
      {emailAndPasswordEnabled && (
        <form className="mt-9 space-y-7" onSubmit={(e) => void submit(e)}>
          <label className="block">
            <span className="field-label block">Email Address</span>
            <span className="field mt-3">
              <Mail className="size-[1.15rem]" strokeWidth={1.7} />
              <input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </span>
          </label>
          <label className="block">
            <span className="flex items-center justify-between">
              <span className="field-label">Password</span>
              <Link to="/forgot-password" className="text-[0.875rem] font-semibold text-primary">
                Forgot Password?
              </Link>
            </span>
            <span className="field mt-3">
              <Lock className="size-[1.15rem]" strokeWidth={1.7} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary mt-8 w-full" disabled={busy}>
            {busy ? (
              "Logging in…"
            ) : (
              <>
                Login
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>
      )}
      <div className="mt-10">
        <SocialButtons next={next} />
      </div>
      <p className="mt-8 text-center text-[0.95rem] text-muted">
        Don't have an account?{" "}
        <Link to="/register" search={{ next }} className="font-semibold text-primary">
          Sign Up
        </Link>
      </p>
    </AuthShell>
  );
}

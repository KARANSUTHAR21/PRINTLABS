import { useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SocialButtons } from "@/components/auth/social-buttons";
import { authClient, storeSessionToken } from "@/lib/auth/client";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { saveSignupProfile } from "@/lib/api/commerce";
import { safeNextPath } from "@/lib/utils";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : "/",
  }),
  component: RegisterRoute,
});

function RegisterRoute() {
  const { next } = useSearch({ from: "/register" });
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!terms) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }
    setBusy(true);
    try {
      const name = `${firstName.trim()} ${lastName.trim()}`.trim();
      const destination = safeNextPath(next);
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: destination,
      });
      if (result.error) throw new Error(result.error.message ?? "Could not create account.");
      storeSessionToken(result.data?.token);
      // Persist first/last name on the PrintHub profile (best-effort).
      void saveSignupProfile({ data: { firstName: firstName.trim(), lastName: lastName.trim() } });
      await navigate({ to: destination });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      photo="/images/auth-shop.jpg"
      photoTitle={
        <>
          Join
          <br />
          PrintHub
          <br />
          Today
        </>
      }
      photoBody="Create your account and unlock a smarter, simpler way to print, copy, scan and more."
      features={[
        { icon: "users", title: "Join a Growing Community", hint: "10K+ happy customers" },
        { icon: "shield", title: "Fast & Easy Setup", hint: "Get started in minutes" },
        { icon: "gift", title: "Exclusive Offers", hint: "Special deals for members" },
      ]}
    >
      <h1 className="text-[2.4rem] font-bold tracking-tight">Create Your Account</h1>
      <p className="mt-3 text-[1.05rem] text-muted">
        Join PrintHub and start printing smarter today.
      </p>
      {emailAndPasswordEnabled && (
        <form className="mt-9 space-y-7" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="field-label block">First Name</span>
              <span className="field mt-3">
                <User className="size-[1.15rem]" strokeWidth={1.7} />
                <input
                  placeholder="Karan"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </span>
            </label>
            <label className="block">
              <span className="field-label block">Last Name</span>
              <span className="field mt-3">
                <User className="size-[1.15rem]" strokeWidth={1.7} />
                <input
                  placeholder="Suthar"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </span>
            </label>
          </div>
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
            <span className="field-label block">Password</span>
            <span className="field mt-3">
              <Lock className="size-[1.15rem]" strokeWidth={1.7} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                autoComplete="new-password"
                minLength={8}
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
            <span className="mt-3 block text-[0.85rem] leading-snug text-muted">
              At least 8 characters with a mix of letters, numbers and symbols.
            </span>
          </label>
          <label className="block">
            <span className="field-label block">Confirm Password</span>
            <span className="field mt-3">
              <Lock className="size-[1.15rem]" strokeWidth={1.7} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm your password"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
          <label className="flex items-start gap-3 text-[0.9rem] text-ink">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 rounded accent-primary"
              required
            />
            <span>
              I agree to the{" "}
              <Link to="/terms" className="text-primary underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary mt-8 w-full" disabled={busy}>
            {busy ? (
              "Creating account…"
            ) : (
              <>
                Create Account
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
        Already have an account?{" "}
        <Link to="/login" search={{ next }} className="font-semibold text-primary">
          Login
        </Link>
      </p>
    </AuthShell>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Lock, Mail, RefreshCw, ShieldCheck, User } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SocialButtons } from "@/components/auth/social-buttons";
import { authClient, storeSessionToken } from "@/lib/auth/client";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import {
  requestRegistrationOtpFn,
  verifyRegistrationOtpFn,
} from "@/lib/api/public";
import { saveSignupProfile } from "@/lib/api/commerce";
import { PASSWORD_HINT, passwordProblem } from "@/lib/password";
import { safeNextPath } from "@/lib/utils";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : "/",
  }),
  component: RegisterRoute,
});

type Step = "details" | "otp";
type AccountType = "CUSTOMER" | "VENDOR";

function RegisterRoute() {
  const { next } = useSearch({ from: "/register" });
  const navigate = useNavigate();

  // Step 1 state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [terms, setTerms] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("CUSTOMER");

  // Step 2 state
  const [step, setStep] = useState<Step>("details");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState("");

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** The code matched and the account exists — we are establishing the session. */
  const [verified, setVerified] = useState(false);

  const otp = useMemo(() => digits.join(""), [digits]);

  // Countdown for the code TTL.
  useEffect(() => {
    if (step !== "otp" || !expiresAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [step, expiresAt]);

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
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
      const res = await requestRegistrationOtpFn({
        data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, accountType },
      });
      if (!res.success) throw new Error(res.message);
      setExpiresAt(Date.now() + res.expiresInSeconds * 1000);
      setDigits(Array(6).fill(""));
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setError("");
    setBusy(true);
    try {
      const res = await verifyRegistrationOtpFn({ data: { email: email.trim(), code } });
      if (!res.success) throw new Error(res.message);

      // The code matched: the account now exists and can log in. Establish the
      // session straight away so a verified user is never left at the form.
      setVerified(true);
      let sessionError = false;
      try {
        const login = await authClient.signIn.email({ email: email.trim(), password });
        if (login.error) sessionError = true;
        else storeSessionToken(login.data?.token);
      } catch {
        sessionError = true;
      }
      const destination = res.accountType === "VENDOR" ? "/vendor/application" : safeNextPath(next);
      if (sessionError) {
        // Verified, but the automatic sign-in did not stick (offline, cookie
        // host, etc.). The account is usable, so hand the user to the login
        // page with a success notice instead of dead-ending them here.
        await navigate({
          to: "/login",
          search: { next: destination, verified: email.trim() },
        });
        return;
      }
      void saveSignupProfile({ data: { firstName: firstName.trim(), lastName: lastName.trim() } });
      await navigate({ to: destination });
    } catch (err) {
      setVerified(false);
      setError(err instanceof Error ? err.message : "Verification failed.");
      setDigits(Array(6).fill(""));
      verifiedRef.current = false; // allow re-entry + auto-verify again
      focusOtp(0); // put the caret back so a retry is one keystroke away
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError("");
    setResendBusy(true);
    try {
      const res = await requestRegistrationOtpFn({
        data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, accountType },
      });
      if (!res.success) throw new Error(res.message);
      setExpiresAt(Date.now() + res.expiresInSeconds * 1000);
      setDigits(Array(6).fill(""));
      setResendNotice(`A new code was sent to ${email.trim()}.`);
      window.setTimeout(() => setResendNotice(""), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code.");
    } finally {
      setResendBusy(false);
    }
  }

  /** Focus one of the six code boxes (and select its digit). */
  function focusOtp(index: number) {
    const el = document.getElementById(`otp-${index}`) as HTMLInputElement | null;
    el?.focus();
    // Select so the next keystroke replaces the digit instead of appending.
    el?.select();
  }

  /**
   * Write `raw` (digits only) starting at `index` and move the caret along.
   *
   * The next focus target is computed SYNCHRONOUSLY. The previous version
   * derived it inside the `setDigits` updater, which React may run during
   * render rather than in the handler — so the caret never left the first box
   * and each keystroke overwrote the previous digit (six presses of "041169"
   * collapsed to "09"), which is why real typed codes were rejected as invalid.
   */
  function setOtpFrom(index: number, raw: string) {
    const chars = raw.replace(/\D/g, "");
    if (chars.length === 0) {
      setDigits((d) => d.map((v, i) => (i === index ? "" : v)));
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      let i = index;
      for (const ch of chars) {
        if (i > 5) break;
        next[i] = ch;
        i += 1;
      }
      return next;
    });
    focusOtp(Math.min(index + chars.length, 5));
  }

  function onDigitChange(index: number, value: string) {
    setOtpFrom(index, value);
  }

  function onDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      setDigits((d) => d.map((v, i) => (i === index - 1 ? "" : v)));
      focusOtp(index - 1);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(6).fill("") as string[];
    pasted.split("").forEach((ch, i) => (next[i] = ch));
    setDigits(next);
    focusOtp(Math.min(pasted.length, 5));
  }

  // The code is valid for 10 minutes (OTP_TTL_SECONDS server-side) — once the
  // countdown hits zero the server rejects it, so stop offering verification.
  const expired = step === "otp" && expiresAt !== null && secondsLeft === 0;

  // Auto-verify exactly once when all six digits are present.
  const verifiedRef = useRef(false);
  useEffect(() => {
    if (step !== "otp" || expired) return;
    if (digits.join("").length === 6 && !verifiedRef.current && !busy) {
      verifiedRef.current = true;
      void verify(digits.join(""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verify reads latest state via closures on digits/email
  }, [digits, step, expired]);

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
      {step === "details" ? (
        <>
          <h1 className="text-[2.4rem] font-bold tracking-tight">Create Your Account</h1>
          <p className="mt-3 text-[1.05rem] text-muted">
            We'll email you a 6-digit code to verify it's you.
          </p>
          {emailAndPasswordEnabled && (
            <form className="mt-9 space-y-7" onSubmit={(e) => void submitDetails(e)}>
              <fieldset>
                <legend className="field-label">I want to join as</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input
                      type="radio"
                      name="accountType"
                      value="CUSTOMER"
                      checked={accountType === "CUSTOMER"}
                      onChange={() => setAccountType("CUSTOMER")}
                      className="mt-1 accent-primary"
                    />
                    <span>
                      <span className="block font-semibold text-ink">Customer</span>
                      <span className="mt-1 block text-sm text-muted">Shop products and services on PrintHub.</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input
                      type="radio"
                      name="accountType"
                      value="VENDOR"
                      checked={accountType === "VENDOR"}
                      onChange={() => setAccountType("VENDOR")}
                      className="mt-1 accent-primary"
                    />
                    <span>
                      <span className="block font-semibold text-ink">Vendor</span>
                      <span className="mt-1 block text-sm text-muted">Apply to list your shop. Admin approval is required.</span>
                    </span>
                  </label>
                </div>
              </fieldset>
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
                  {PASSWORD_HINT}
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
                  "Sending code…"
                ) : (
                  <>
                    Send Verification Code
                    <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </form>
          )}
          {accountType === "CUSTOMER" ? (
            <div className="mt-10">
              <SocialButtons next={next} />
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-muted">
              Vendor registration uses email verification so your application intent is saved securely.
            </p>
          )}
          <p className="mt-8 text-center text-[0.95rem] text-muted">
            Already have an account?{" "}
            <Link to="/login" search={{ next }} className="font-semibold text-primary">
              Login
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="text-[2.4rem] font-bold tracking-tight">Verify your email</h1>
          <p className="mt-3 text-[1.05rem] text-muted">
            We sent a 6-digit code to <strong className="text-ink">{email}</strong>. 
            {expired ? (
              <>
                {" "}
                <span className="font-semibold text-danger" role="alert">
                  That code has expired — request a new one.
                </span>
              </>
            ) : (
              secondsLeft > 0 && (
                <>
                  {" "}
                  It expires in{" "}
                  <span className="tabular-nums text-ink">
                    {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                  </span>
                  .
                </>
              )
            )}
          </p>
          <form
            className="mt-9 space-y-7"
            onSubmit={(e) => {
              e.preventDefault();
              if (otp.length === 6) void verify(otp);
            }}
          >
            <div className="flex justify-between gap-2 sm:gap-3" onPaste={onPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={6}
                  className="h-16 w-full rounded-2xl border border-line bg-white text-center text-2xl font-bold tabular-nums text-ink focus:border-primary focus:outline-none"
                  value={d}
                  onChange={(e) => onDigitChange(i, e.target.value)}
                  onKeyDown={(e) => onDigitKeyDown(i, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  disabled={busy}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
            {verified && (
              <p className="text-sm font-semibold text-primary" role="status">
                Email verified — your account is ready. Signing you in…
              </p>
            )}
            {resendNotice && (
              <p className="text-sm text-primary" role="status">
                {resendNotice}
              </p>
            )}
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={busy || otp.length !== 6 || expired}
            >
              {busy ? (
                verified ? "Email verified — signing you in…" : "Verifying…"
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Verify &amp; Create Account
                </>
              )}
            </button>
            <div className="flex items-center justify-between text-[0.9rem]">
              <button
                type="button"
                className="inline-flex items-center gap-2 font-semibold text-primary disabled:opacity-50"
                onClick={() => void resendCode()}
                disabled={resendBusy || busy}
              >
                <RefreshCw className={resendBusy ? "size-4 animate-spin" : "size-4"} />
                Resend code
              </button>
              <button
                type="button"
                className="font-semibold text-muted underline"
                onClick={() => {
                  setStep("details");
                  setError("");
                  setDigits(Array(6).fill(""));
                }}
              >
                Change email / details
              </button>
            </div>
          </form>
        </>
      )}
    </AuthShell>
  );
}

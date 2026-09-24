import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export function SocialButtons({ next = "/" }: { next?: string }) {
  if (!authEnabled) return null;
  return (
    <div>
      <div className="flex items-center gap-4 text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-muted-2">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="mt-9 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        {GROK_PROVIDERS.map((p) => (
          <button
            key={p.providerId}
            type="button"
            className="btn-outline min-h-[3.4rem] gap-3 text-[0.95rem]"
            onClick={() => void signIn(p.providerId, { callbackURL: next })}
          >
            {p.label === "Google" ? <GoogleMark /> : <XMark />}
            Continue with {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.1rem]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.8l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.3a12 12 0 0 0 0 10.8l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.7l4 3.1A7.2 7.2 0 0 1 12 4.8z"
      />
    </svg>
  );
}

function XMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.1rem]" aria-hidden="true">
      <path
        fill="#0f2540"
        d="M13.3 10.5 20.2 3h-1.6l-6 6.8L7.8 3H3.2l7.3 10.3L3.2 21h1.6l6.4-7.2L16.2 21h4.6z"
      />
    </svg>
  );
}

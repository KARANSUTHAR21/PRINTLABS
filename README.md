# PrintHub

A production-structured e-commerce application for a neighbourhood
printing, copying, scanning, stationery and custom-printing business —
built as a real full-stack shop, not a mockup.

Guests can browse, search and cart freely. Checkout, orders, payments,
invoices and profile data are authentication-gated on **both** the client
and the server, with a payment pipeline designed so that double clicks,
refreshes, multiple tabs, duplicate webhooks, browser crashes and
concurrent requests can never produce duplicate orders, duplicate
invoices, incorrect totals or falsely-marked successful payments.

## Core payment invariants

These rules are enforced server-side and are the heart of the design:

1. ONE successful real-world payment = ONE order = ONE invoice.
2. Failed payments never produce a PAID order.
3. Frontend "payment success" is never trusted — only server-side
   signature verification or a verified webhook finalizes an order.
4. Frontend-provided prices/totals are never trusted — the backend
   recalculates everything from the database.
5. Duplicate webhooks produce one business operation (event-ID ledger).
6. Repeated Pay clicks reuse one controlled Razorpay payment session.

## Technology stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 19, TanStack Router/Start (file-based routes, server functions), Tailwind CSS v4, Radix UI, Lucide icons |
| Backend    | TanStack Start server functions (a typed RPC layer over HTTP), Node runtime |
| Database   | Postgres — Neon in production (`DATABASE_URL`), embedded PGLite in local/dev (zero-config fallback) |
| Payments   | Razorpay Checkout + Orders API (sandbox keys fall back to a built-in HMAC-signed sandbox provider) |
| Invoices   | pdf-lib (server-side PDF generation) |
| Auth       | Better Auth — email/password with bcrypt-style secure hashing, HTTP-only cookies, optional federated OAuth |
| State      | React Context (Auth, Cart), localStorage guest cart |

> Note: the originally-planned Flask/MongoDB/Redis stack was consolidated
> into this TypeScript stack during the planning phase of this workspace.
> Every functional requirement (catalog, cart, auth, payments, invoices,
> idempotency, locking, rate limiting, reconciliation) is implemented
> against the primitives here; the mapping is documented in
> `API_DOCUMENTATION.md`.

## Architecture

```
Browser (React SPA)
   │  fetch / server-function RPC
   ▼
TanStack Start server (Node)
   ├── authMiddleware ──► Better Auth session (HTTP-only cookie / bearer)
   ├── commerce API  ──► Postgres/Neon (via getSql())
   │      ├── orders ──► payment_attempts ──► invoices
   │      ├── idempotency_keys (unique, replay-safe)
   │      ├── stock_reservations (atomic decrement, release on cancel)
   │      └── webhook_events (unique provider event id)
   ├── audit_logs (payment lifecycle events, no secrets)
   └── Razorpay REST API (Orders API, signature verification, webhooks)
```

### Folder structure

```
migrations/              SQL schema (single source of truth, auto-applied)
  0001_auth.sql          Better Auth tables
  0002_commerce.sql      products, services, orders, payments, invoices, …
  0003_seed.sql          16 products + 5 services (idempotent seed)
src/
  routes/                File-based routes (pages + server endpoints)
    api/                 Server endpoints: webhook, invoice PDF, auth
    *.tsx                Pages (home, services, products, cart, checkout, …)
  lib/
    api/                 Typed client-facing server functions
      public.ts          Catalog + password-reset (public)
      commerce.ts        Cart, orders, payments, invoices, profile (auth)
      maintenance.ts     Payment reconciliation trigger
    server/              Business logic (server-only)
      orders.ts          Order creation, price/stock authority, cancellation
      payments.ts        Payment sessions, verification, webhook, reconcile
      invoices.ts        One-invoice-per-payment + PDF builder
      machine.ts         Payment & order state machines
      idempotency.ts     Idempotency-key ledger
      locks.ts           In-process mutex (single-node; see below)
      provider.ts        Razorpay client + sandbox fallback + HMAC
      cache.ts           TTL cache with graceful failure
      rate-limit.ts      Fixed-window rate limiter
      audit.ts           Payment audit log
    auth/                Better Auth wiring, middleware, session helpers
  components/            UI (navbar, cards, cart, payment button, …)
scripts/                 Tests + tooling
```

## Features

### Storefront
- Home, Services, Service detail, Products (search, category, sort),
  Product detail, About — all served from the database.
- Guest cart persisted in localStorage; merged with the server cart on
  login (stock-limited, no duplicate lines).
- Search across name/description/category with DB indexes + caching.

### Authentication
- Register (first/last name, terms), Login, Logout, Forgot password,
  Reset password (hashed, single-use, expiring tokens), Change password,
  Profile update. Passwords hashed; hashes never leave the server.
- Protected routes on the client (`Protected` gates) **and** on the
  server (`authMiddleware` on every private server function).
- Checkout preservation: `/checkout` → login → return to `/checkout`
  (sanitized `next`, never a self-referential redirect).

### Payments (Razorpay)
- **State machines** for payments (`CREATED → PAYMENT_INITIATED →
  PROCESSING → PAID` + FAILED/CANCELLED/EXPIRED/REFUNDED) and orders
  (`PENDING_PAYMENT → PAYMENT_PROCESSING → CONFIRMED → …`). Only legal
  transitions are applied; guards are idempotent.
- **Payment attempts**: one row per attempt with attempt number,
  idempotency key, provider order id, amount, TTL (`expires_at`), and a
  partial-unique index guaranteeing at most ONE active attempt per order.
- **Idempotency** on order creation, payment-session creation and
  verification: same key + same request replays the original response;
  key reuse with a different request is rejected.
- **Price integrity**: cart sends product ids + quantities only. The
  backend loads live prices/stock, computes subtotal/tax/total, verifies
  the Razorpay order's amount matches, and rejects verification on any
  mismatch (amount, order, user, signature).
- **Webhooks**: HMAC-SHA256 signature verification (`x-razorpay-signature`),
  event-id ledger for exactly-once processing, order-independent — a
  webhook arriving before/after/without frontend verification converges
  to the same PAID state.
- **Status polling**: `paymentStatus` endpoint stops clients at terminal
  states; UI states cover READY/CREATING/PAYMENT_OPEN/VERIFYING/
  PROCESSING/SUCCESS/FAILED/EXPIRED/UNKNOWN.
- **Reconciliation**: stale in-flight attempts past their TTL are expired
  by `reconcileStaleAttempts`, triggered opportunistically by clients
  (no separate worker needed) and idempotent under concurrency.
- **Inventory**: atomic conditional stock decrement (`stock >= qty` and
  `active`) recorded in `stock_reservations`; released on cancellation.
  Overselling is impossible even under concurrent checkouts.
- **Audit log** of the whole payment lifecycle — never any secrets.
- **Sandbox mode**: without Razorpay keys the app uses a built-in
  HMAC-signed sandbox provider so the full flow (create → verify →
  finalize → invoice) is exercisable offline.

### Invoices
- Exactly one invoice per successful payment (unique `order_id` +
  sequence numbers via an atomic counter table; duplicate races resolved
  by unique constraints, never duplicated).
- Virtual bill page + downloadable server-rendered PDF
  (`/api/invoices/:orderId/pdf`, owner/admin only, ASCII-safe rendering).

## Getting started

Requirements: Node 20+ (18 likely works), npm. A database is optional —
without `DATABASE_URL` the app runs on embedded PGLite with the same
schema, so `npm run dev` works out of the box.

```bash
npm install
npm run dev            # http://localhost:8080
```

Seed data (16 products, 5 services) is applied automatically via
`migrations/0003_seed.sql` on first boot. Demo accounts: just register
in the UI — accounts are real rows in the `user` table.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres/Neon connection string; omit for local PGLite |
| `BETTER_AUTH_SECRET` | Auth signing secret (auto-generated per-process in dev) |
| `BETTER_AUTH_URL` | Public origin when deployed |
| `VITE_AUTH_ENABLED` | `false` disables auth entirely (dev convenience) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live/test Razorpay keys; omit to use the built-in sandbox provider |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for webhook signature verification |
| `FRONTEND_URL` | Absolute base URL used in password-reset emails |
| `MAIL_*` | SMTP settings for transactional email (logging fallback) |

### Testing

```bash
npm test               # all unit/integration tests (node:test)
npm run typecheck      # TypeScript
npm run check:auth     # auth invariant checks
```

Test coverage includes the payment state machine (legal/illegal
transitions, terminal states), idempotency semantics (replay,
cross-user/key-reuse rejection), payment security (signature
verification, webhook body sensitivity, token entropy, rate limiting)
and money math (₹ formatting, tax rounding).

### Payment testing checklist

With the built-in sandbox provider (no keys needed):

1. Add items → checkout → complete the auth gate → place order.
2. Pay → confirm dialog → verification → order success + invoice.
3. Repeat Pay clicks: only one payment session is created (server-side
   lock + active-attempt uniqueness); the UI disables the button too.
4. Refresh on the success page: state is re-derived from the database,
   never from the client.
5. Cancel the payment dialog: the attempt is marked FAILED, and a new
   attempt is allowed (attempt #2 reuse, same order — no new order).

With Razorpay test keys, additionally exercise:

- Webhook before/after frontend verification (both converge to PAID).
- Duplicate webhook deliveries (processed exactly once).
- Amount tampering (rejected: provider amount ≠ order amount).
- Signature tampering (rejected).
- TTL expiry of stale attempts via reconciliation.

### Concurrency

- **Order/payment creation**: idempotency keys + unique active-attempt
  index + an in-process lock around payment session creation.
- **Verification/webhook race**: finalize is guarded by "only transition
  if not already PAID" + unique `razorpay_payment_id`; whichever arrives
  second becomes a no-op, and invoice creation dedupes by order.
- **Multi-instance deployments**: swap `locks.ts` for a Redis/Postgres
  advisory-lock implementation; the DB constraints already guarantee
  correctness — the lock only reduces contention.

## Production deployment notes

- Deploy with `DATABASE_URL` + `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL`
  set; sessions then ride HTTP-only `__Host-` cookies.
- Set real Razorpay keys and configure the webhook endpoint
  (`POST /api/payments/webhook`) with your webhook secret.
- `npm run build` applies migrations to the production database.
- Enable a scheduled call to the reconciliation trigger (or call
  `reconcileStaleAttempts` from a cron) for browser-close recovery even
  when no client is polling.
- Never commit secrets; all credentials are environment-injected.

# PrintHub API Documentation

All endpoints are TanStack Start **server functions** (typed RPC over
HTTP) unless marked as a raw route. Every handler returns a consistent
envelope:

```jsonc
// success
{ "success": true, "...": "payload" }
// failure — no stack traces, no internals
{ "success": false, "message": "Payment is already being processed.", "status": 409, "code": "..." }
```

HTTP status codes used: `200` ok, `201` created, `400` bad request,
`401` unauthorized, `403` forbidden, `404` not found, `409` conflict /
state error, `422` validation error, `429` rate-limited, `500` internal.

Authentication: a valid Better Auth session (HTTP-only cookie when
deployed; `Authorization: Bearer <token>` in the embedded preview).
Requests from another site are rejected (`SameSite` isolation); per-user
data is always scoped by the **server-verified** user id, never by any
client-supplied identifier.

Rate limits (per user, in-memory fixed window): orders 8/min,
payment-session creation 10/min, verification 20/min, forgot-password
5/15min per email, reset 8/15min per token.

---

## Authentication — `/api/auth/*`

Raw Better Auth endpoints (CSRF/origin-checked). Session cookie is
`__Host-`-prefixed, HttpOnly, Secure, SameSite=Lax; sessions expire and
invalid cookies simply resolve to "signed out".

| Action | Method & path | Body |
|---|---|---|
| Register | `POST /api/auth/sign-up/email` | `{ name, email, password }` |
| Login | `POST /api/auth/sign-in/email` | `{ email, password }` |
| Logout | `POST /api/auth/sign-out` | – |
| Current user | `GET /api/auth/get-session` | – |
| Change password | `POST /api/auth/change-password` | `{ currentPassword, newPassword, revokeOtherSessions }` |

Password hashing, strength checks, duplicate-email detection and
brute-force throttling are handled by Better Auth. Password hashes are
never returned to the client.

### Forgot / reset password (app endpoints, public)

| Endpoint | Body | Behavior |
|---|---|---|
| `forgotPassword` | `{ email }` | Creates a single-use, 30-minute, SHA-256-hashed token. Always returns the generic message *"If an account exists for this email, a reset link has been sent."* — account existence is never disclosed. |
| `confirmReset` | `{ token, password }` | Verifies hash + expiry + single use, updates the password. `400 EXPIRED` for dead links. |

---

## Catalog (public)

| Endpoint | Params | Returns |
|---|---|---|
| `fetchProducts` | `{ search?, category?, sort?: latest\|price_asc\|price_desc }` | `{ products }` — active products only, price from DB |
| `fetchProduct` | id or slug | `{ product }` |
| `fetchServices` | – | `{ services }` |
| `fetchService` | id or slug | `{ service }` |

Search covers name, description and category (indexed `LIKE` filters);
result lists are cached with short TTLs and invalidated on catalog
writes. Cache failure never breaks a request — the loader falls back to
the database.

---

## Cart (authentication required)

| Endpoint | Body | Notes |
|---|---|---|
| `loadCart` | – | Server-computed view: items, subtotal, tax, total, count |
| `addToCart` | `{ productId, quantity ≥ 1 }` | Validates product active + stock |
| `updateCartItem` | `{ productId, quantity ≥ 0 }` | `0` removes |
| `deleteCartItem` | `{ productId }` | |
| `emptyCart` | – | |
| `mergeCart` | `{ items: [{ productId, quantity }] }` | Guest-cart merge on login; quantities summed per product, clamped to stock, no duplicate lines |

Totals shown to the user are informational. The **authoritative**
calculation happens at order creation.

---

## Orders (authentication required)

### `POST placeOrder` — create or resume the checkout order

```jsonc
// request
{ "idempotencyKey": "uuid", "customer": { "firstName": "…", "lastName": "…", "email": "…", "phone": "…", "addressLine": "…", "city": "…", "pincode": "…" } }
// response
{ "success": true, "order": { "id": "PH-…", "items": [...], "subtotalPaise": 4800, "taxPaise": 0, "totalPaise": 4800, "paymentStatus": "CREATED", "orderStatus": "PENDING_PAYMENT", "invoiceNumber": null, ... } }
```

Server-side behavior, in order:

1. **Idempotency**: same key + same body replays the original order.
2. **Resume**: an existing pending order for the user is reused **only
   if its items match the current cart**; otherwise `409 PENDING_ORDER`.
3. **Price integrity**: every product is reloaded from the database;
   inactive products reject the order; stock is verified.
4. **Inventory**: atomic `UPDATE … WHERE stock >= qty AND active`
   decrement recorded in `stock_reservations`; a partial failure rolls
   back earlier decrements (release) — overselling is impossible.
5. **Totals**: computed server-side (`calcTotals`); the client's numbers
   are ignored.
6. Result is written to the idempotency ledger before returning.

### Other order endpoints

| Endpoint | Notes |
|---|---|
| `loadOrders` | The caller's orders only, newest first |
| `loadOrder` | Owner or admin only — other users' ids return `404` |
| `cancelPendingOrder` | Owner-only; refuses while a payment is `PROCESSING` or the order is paid; releases reserved stock |

---

## Payments (authentication required)

Payment state machine — only these transitions are legal:

```
CREATED → PAYMENT_INITIATED → PROCESSING → PAID
   │            │                │
   │            ├──► FAILED      ├──► FAILED
   │            ├──► CANCELLED   └──► EXPIRED
   │            └──► EXPIRED
   └──► CANCELLED / EXPIRED
PAID → REFUNDED          (FAILED / CANCELLED / EXPIRED / REFUNDED are terminal)
```

Order states: `PENDING_PAYMENT → PAYMENT_PROCESSING → CONFIRMED →
PROCESSING → READY → COMPLETED` (+ `CANCELLED` where valid).

### `POST startPayment` — create or reuse the payment session

```jsonc
// request
{ "orderId": "PH-…", "idempotencyKey": "uuid" }
// response
{ "success": true, "session": { "orderId": "PH-…", "attemptId": "pay_…", "razorpayOrderId": "order_…", "amountPaise": 4800, "currency": "INR", "keyId": "rzp_test_…", "sandbox": false, "status": "PAYMENT_INITIATED", "expiresAt": "…" } }
```

- Idempotent: repeated clicks with the same key return the same session.
- Guarded by a lock (`payment_lock:{orderId}`) + re-checks inside the
  critical section; a valid, unexpired attempt is **reused**, never
  duplicated (DB partial-unique index enforces one active attempt).
- A new attempt is only created when the previous one is
  FAILED/CANCELLED/EXPIRED (attempt #N+1, same order).
- The amount sent to the provider is the backend-calculated total; the
  provider's response amount is cross-checked before use.

### `POST verifyPayment` — frontend callback verification

```jsonc
{ "orderId": "PH-…", "razorpayOrderId": "order_…", "razorpayPaymentId": "pay_…", "signature": "hmac…" }
```

Rejects with `400 BAD_SIGNATURE` / `409` on: invalid HMAC signature,
wrong order, wrong user, amount mismatch, or an illegal state
transition. On success the order is finalized (PAID + CONFIRMED),
the payment id is stored, and **exactly one** invoice is created.

### `GET loadPaymentStatus` — polling

Returns `{ orderId, paymentStatus, orderStatus, invoiceNumber,
totalPaise }` after running reconciliation for the order. Terminal
states (`PAID`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`) stop
client polling.

### `POST abandonPayment` / `POST completeSandboxPayment`

- `abandonPayment`: marks the active attempt FAILED only when still
  pre-`PROCESSING` (never races a real verification).
- `completeSandboxPayment`: **sandbox builds only** — signs and verifies
  a synthetic payment so the full pipeline runs without external keys.

### `POST /api/payments/webhook` — raw Razorpay webhook

- HMAC-SHA256 signature verification against `RAZORPAY_WEBHOOK_SECRET`
  (`400 BAD_SIGNATURE` on failure).
- Event-id ledger (`webhook_events.provider_event_id`, UNIQUE):
  duplicate deliveries return `{ ok: true, duplicate: true }` and cause
  **no** business operation.
- Processes `payment.captured` (finalize → PAID → invoice) and
  `payment.failed` (mark FAILED). Safe in every arrival order relative
  to frontend verification — the transition guards make both idempotent.

### Reconciliation (spec: browser-close recovery)

`POST reconcilePayments` (maintenance, no auth) and the per-order path
inside `paymentStatus` expire in-flight attempts past their TTL and put
orders back to `PENDING_PAYMENT`, releasing the active-attempt slot so a
new attempt can start. Idempotent under concurrency; call from a cron
for guaranteed recovery when no browser is polling.

---

## Invoices (authentication required)

| Endpoint | Notes |
|---|---|
| `loadInvoice` | The invoice for an order — owner or admin only |
| `GET /api/invoices/:orderId/pdf` | Raw route; streams the PDF (`Content-Disposition: attachment`). Owner/admin only; `401` without a session, `404` for anyone else's order |

One successful payment yields exactly one invoice: unique `order_id` +
sequential `invoiceNumber` from an atomic counter table; concurrent
creation races are resolved by the unique constraint (the loser re-reads
and returns the winner's invoice — never a duplicate).

PDF contents: PrintHub branding, invoice number, order id, date,
payment id, customer name/email, line items, subtotal/tax/total, PAID
status. Rendering is ASCII-safe (WinAnsi) so arbitrary customer input
cannot break generation.

---

## Profile (authentication required)

| Endpoint | Notes |
|---|---|
| `loadProfile` | First/last name, phone, address, city, PIN, role, created date |
| `saveProfile` | Whitelisted fields only; user id, role and credentials are never writable |
| `saveSignupProfile` | Seeds first/last name after registration (best-effort) |

---

## Data model

```
user / session / account      Better Auth (email + hashed credentials)
user_profiles                 role USER|ADMIN, address book
products                      slug UNIQUE, category+active indexed
services                      slug UNIQUE
cart_items                    PK (user_id, product_id)
orders                        orderId UNIQUE, razorpay_order_id UNIQUE (partial),
                              invoice_number UNIQUE
order_items                   line items with unit-price snapshot
payment_attempts              idempotency_key UNIQUE, razorpay_order_id UNIQUE,
                              razorpay_payment_id UNIQUE,
                              one ACTIVE attempt per order (partial unique index)
invoices                      invoice_number UNIQUE, order_id UNIQUE
password_resets               token_hash UNIQUE, single-use, expiring
webhook_events                provider_event_id UNIQUE (exactly-once)
audit_logs                    payment lifecycle events (no secrets)
stock_reservations            atomic inventory decrement ledger
invoice_counters              atomic per-year invoice numbering
idempotency_keys              UNIQUE key + request hash + stored response
```

## Security summary

- Server-verified identity on every private operation; cross-site
  scripted requests rejected at the middleware chokepoint.
- All prices/totals/stock/authority computed server-side.
- Signature + amount + order + user checks before any PAID transition.
- Ownership checks on orders, invoices, PDFs, profile.
- Rate limiting on financial and credential endpoints.
- Audit log without secrets; errors without stack traces.

# PrintHub — Delivery Roadmap

The core application is complete and verified: storefront, auth, cart,
checkout, sandbox payment pipeline, invoices, PDF generation, idempotency,
state machines, reconciliation, tests (276 green), README and API docs.

This roadmap covers **everything remaining**, capped at 12 phases. Phases
are ordered by dependency and risk — each is shippable on its own. Phases
1–4 are required for production launch; 5–12 harden and extend.

Status markers: ☐ not started · ◐ in progress · ☑ done.

---

## Phase 1 — Stabilize the test suite ☑

**Goal:** `npm test` fully green. **Done.**

- Fixed all 17 template-invariant failures: a real Windows bug in
  `with-app-env.mjs` (`shell: true` + unquoted spaced paths — e.g.
  `C:\Program Files\nodejs\node.exe` never launched), hermetic workspace
  copies in its spawn tests (the old ones were workspace-coupled),
  cwd-isolated PWA identity tests (PrintHub's site.json leaked into
  default-cwd calls), and test expectations updated to this workspace's
  intentional customizations (auth-on app-env, promoted auth migration,
  replaced AGENTS.md brief).
- The Windows npm glob quirk is fixed at the root (double-quoted glob in
  `npm test`), so both segments run and are counted; a separate
  `test:ci` target is unnecessary.
- Build leg repaired too: installed the undeclared `@vercel/nft`
  (packaging bug in nitro's `nf3` tracer) — `npm run build` passes.

**Accept:** `npm test` exits 0 with the scripts tests actually counted
(221 + 55, exit 0). ☑

## Phase 2 — Real Razorpay integration ☐

**Goal:** Replace the built-in sandbox provider with Razorpay test keys.

- Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`; confirm
  `createProviderOrder` hits the Orders API and the amount cross-check
  fires.
- Exercise the hosted Checkout.js path in `payment-button.tsx` (currently
  only the sandbox branch has been run): open modal → success handler →
  `verifyPayment` → finalize → invoice.
- Verify dismissal/timeout paths (`onDismiss` → poll → terminal state)
  against the real modal.
- Document key rotation in the README ops section.

**Accept:** A real ₹1 test payment completes end to end and produces an
invoice; cancel/dismiss paths leave the order payable again.

## Phase 3 — Webhook pipeline verification ☐

**Goal:** Prove the webhook is production-correct with the real provider.

- Set `RAZORPAY_WEBHOOK_SECRET`; point the Razorpay dashboard at
  `POST /api/payments/webhook`.
- Verify with Razorpay's official signature examples: valid capture,
  failed payment, tampered signature, unknown order, duplicate event id.
- Run the race matrix from the spec: webhook-before-verify,
  webhook-after-verify, webhook-only (browser closed) — all must converge
  to exactly one PAID order + one invoice.
- Add a scripted webhook replay test (raw fixtures + local HMAC signing)
  to `npm test`.

**Accept:** Replay of the same capture webhook twice yields one invoice;
the race matrix passes.

## Phase 4 — Concurrency stress suite ☐

**Goal:** Lock in the payment invariants under load.

- Scripted test hitting the running server with 10 parallel
  `startPayment` calls (same order): assert exactly one active attempt
  and one provider order.
- 10 parallel `verifyPayment` calls with the same valid payload: one
  final PAID order, one invoice, 9 idempotent no-ops.
- Two simultaneous checkouts (two sessions, same user): no duplicate
  successful orders.
- Double-click simulation at the HTTP layer.

**Accept:** Suite runs in CI mode; all invariants hold.

## Phase 5 — Admin dashboard ☐

**Goal:** Expose the existing USER/ADMIN architecture.

- `/admin` route group gated by the `role` in `user_profiles` (server
  side via `isAdmin`, not client state).
- Product CRUD + stock management (server functions already have the
  primitives; add admin-guarded mutations + cache invalidation via
  `invalidateCatalog`).
- Order management: advance the order lifecycle
  (`CONFIRMED → PROCESSING → READY → COMPLETED`) using the existing
  state machine guards; view payment attempts and audit log per order.
- Service management.

**Accept:** A non-admin gets 403/404 on every admin surface; state
transitions respect `ORDER_TRANSITIONS`.

## Phase 6 — Order fulfillment lifecycle ☐

**Goal:** Operate the post-payment states meaningfully.

- Admin picks up Phase 5's transitions; customer sees live status on
  `/orders/:id` (already renders `orderStatus`).
- Optional: status-change email via the Phase 7 mail service.

**Accept:** An order can travel CONFIRMED → COMPLETED through the UI
without violating the machine.

## Phase 7 — Transactional email ☐

**Goal:** Replace the console-logging mail stub.

- Implement `email_service` on nodemailer (or an HTTP provider API)
  behind `MAIL_*` env vars.
- Send: password reset (link already built), order confirmation,
  invoice-available notification.
- Keep the generic no-disclosure contract for forgot-password; failures
  to send must never fail the payment flow (fire-and-forget + audit).

**Accept:** Reset email arrives with a working single-use link; an order
confirmation arrives after PAID.

## Phase 8 — Multi-instance readiness ☐

**Goal:** Remove single-node assumptions for horizontal scale.

- Swap `src/lib/server/locks.ts` (in-process mutex) for Postgres
  advisory locks (no new infra) or Redis if preferred — the DB unique
  constraints already guarantee correctness; the lock only prevents
  contention.
- Move the in-memory rate limiter to a shared store (same backends).
- Decide cache strategy: the TTL cache is per-process and safe (catalog
  only) — document or centralize as needed.

**Accept:** Two app instances behind a load balancer pass the Phase 4
stress suite.

## Phase 9 — Security hardening pass ☐

**Goal:** Close remaining production gaps.

- Security headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors).
- Review audit-log retention and add an admin view (Phase 5 dependency).
- Secret management audit: no secrets in client bundles; rotate the
  Better Auth secret procedure documented.
- Dependency audit (`npm audit`) and lockfile pinning policy.

**Accept:** Headers verified in production; audit clean.

## Phase 10 — Observability ☐

**Goal:** See failures before customers do.

- Structured logging for payment events (audit table is the source of
  truth; add log shipping).
- Metrics: payment success rate, attempt counts, webhook latency,
  reconciliation expiries.
- Error tracking (Sentry or equivalent) wired into the error component
  and server handlers.
- Alerting on: webhook signature failures, verification rejections,
  reconciliation backlog.

**Accept:** A deliberately-broken sandbox payment triggers an alert.

## Phase 11 — Accessibility & performance audit ☐

**Goal:** Ship the quality bar the spec set.

- Keyboard/AT pass over navbar, search dialog, cart, checkout, payment
  button (focus traps, ARIA live regions for payment states, focus
  visibility).
- Lighthouse run: fix contrast/label issues, lazy-load product images,
  preload hero fonts.

**Accept:** ≥ 95 Lighthouse a11y on the core pages; payment status
announced to screen readers.

## Phase 12 — Production launch checklist ☐

**Goal:** Flip to live.

- Deploy with `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  Razorpay keys + webhook secret (Phases 2–3 done).
- `npm run build` applies migrations; verify seed idempotency on prod.
- Schedule the reconciliation trigger (cron hitting
  `reconcilePayments`) for browser-close recovery without pollers.
- Database backup schedule + restore drill.
- Smoke: register → buy ₹1 item → invoice PDF → refund path documented.

**Accept:** Real order placed on production; monitoring quiet; backup
restored into staging successfully.

---

### Dependency notes

- Phases 1→4 are strictly ordered (a green suite is the safety net for
  everything else).
- Phase 5 unlocks 6 and parts of 9.
- Phase 7 needs nothing but is best before 12 (real reset emails).
- Phase 8 can proceed in parallel with 5–7.
- 12 blocks on 1–4, 7 and a deploy target; 9–11 should precede it for a
  public launch.

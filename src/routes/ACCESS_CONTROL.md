# PrintHub role-based access control

The canonical primary roles are `USER` (User / Customer), `VENDOR`, `ADMIN`, and `DELIVERY_PARTNER`. Their responsibilities, permissions and route prefixes are centrally declared in [`src/lib/auth/roles.ts`](../lib/auth/roles.ts). New registrations must also choose `account_type` (`CUSTOMER` or `VENDOR`), persisted separately from the role. Authentication verifies a session; server functions enforce authorization from the current database role using `requireRoleMiddleware` and `requireRole`. A Vendor signup is only a request to apply; it does not itself grant the privileged `VENDOR` role.

## Route map

| Role | Route baseline |
|---|---|
| User / Customer | Public `/`, `/about`, `/privacy`, `/terms`, `/services/*`, `/products/*`; authenticated `/cart`, `/checkout`, `/orders`, `/orders/$orderId`, `/order-success/$orderId`, `/invoice/$orderId`, `/profile`, `/vendor/application`, and `/delivery/request` |
| Vendor | `/vendor/dashboard`, `/vendor/shop`, `/vendor/inventory/*`, `/vendor/orders`, `/vendor/pickup`, `/vendor/customers`, `/vendor/receipts/*`, `/vendor/subscription/*`, `/vendor/payment-details`, `/vendor/sales`, `/vendor/notifications`, `/vendor/profile`, `/vendor/settings`, `/vendor/support` |
| Admin | `/admin/*` for users, vendors, shops, products, services, orders, payment attempts, refund review, subscriptions, delivery partners and audit; `/vendor/admin` for legacy vendor approval; `/delivery/admin` for delivery request assignment |
| Delivery Partner | `/delivery/dashboard`, `/delivery/orders`, `/delivery/history`, `/delivery/earnings`, `/delivery/notifications`, `/delivery/profile`, `/delivery/settings`; new assignment is customer-requested and Admin-assigned |

Route policy is only a navigation/UI aid. The server APIs remain the security boundary. No Postgres row-level security policies are currently installed; authorization and ownership are enforced by server middleware and scoped parameterized SQL, not database RLS. Commerce reads retain owner scoping; invoice bearer links are constrained to the signed order; vendor service SQL scopes vendor and shop IDs; delivery reads/status changes require both `DELIVERY_PARTNER` role and an assignment belonging to that partner; customer-triggered expiry reconciliation filters strictly to that customer.

## Conversion and assignment workflow

A user registered with `account_type = 'VENDOR'` submits `/vendor/application`; only Admin may approve/reject. Approval atomically grants `VENDOR`, creates the inactive/unverified shop and trial. `adminSetUserRole` cannot grant `VENDOR`; vendor conversion stays in the application workflow. Customers may request delivery for their own eligible paid order; Admins review pending requests at `/delivery/admin` and may assign only to accounts whose database role is `DELIVERY_PARTNER`, for orders still paid and ready. Delivery Partner availability is persisted under the authenticated partner ID, and assignment SQL rejects unavailable partners. Pickup/delivery transitions, order reads, history, earnings summary, and notification acknowledgement are scoped to the caller's assignment/account.

Admin refund cases are review records only: Admin can open a case for a paid order, review/approve/decline it, and record a reference after issuing a refund externally. No refund provider API is called and no payment/order balance is mutated. Delivery earnings shows completed order value only; partner compensation and payouts are not configured.

## Continuous route and API authorization checks

`scripts/route-access.test.mjs` runs in the normal test glob. It inventories every `createFileRoute` declaration and fails on missing/stale role policy, missing UI guard, duplicate route declarations, and missing focused security coverage for Admin/Delivery/vendor-support workspaces. It also inventories each exported `createServerFn`, requires authenticated role middleware for protected functions, and accepts unauthenticated/auth-only calls only from explicit allowlists. A route addition/removal therefore requires the policy entry and tests to be updated in the same change. Run `npm test` to execute the evaluator.

The evaluator is a static registration/policy/middleware consistency gate, not a proof of SQL-level ownership correctness. Resource authorization must continue to be enforced by parameterized owner-scoped queries; no Postgres row-level security policies are installed. Integration tests in `scripts/role-access.test.mjs` exercise role boundaries, delivery ownership/availability/transitions, and refund review lifecycle. Existing customer order/invoice tests and vendor integration tests cover their respective owner scopes.

Vendor checkout-scoped orders, vendor pickup fulfillment, paid subscriptions, settlements and payout records remain unavailable until their secure commerce integrations exist. Admin subscriptions/payments are currently read-only; refund workflow is review-only; delivery partner compensation is intentionally not represented as paid earnings.

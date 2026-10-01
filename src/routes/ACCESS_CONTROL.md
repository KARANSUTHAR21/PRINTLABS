# PrintHub role-based access control

The canonical primary roles are `USER` (User / Customer), `VENDOR`, `ADMIN`, and `DELIVERY_PARTNER`. Their responsibilities, permissions and route prefixes are centrally declared in [`src/lib/auth/roles.ts`](../lib/auth/roles.ts). Authentication verifies a session; server functions enforce authorization from the current database role using `requireRoleMiddleware` and `requireRole`.

## Route map

| Role | Route baseline |
|---|---|
| User / Customer | Public `/`, `/services`, `/products`, `/products/$id`; authenticated `/cart`, `/checkout`, `/orders`, `/orders/$orderId`, `/invoice/$orderId`, `/profile`, authentication routes, and `/vendor/application` |
| Vendor | `/vendor/dashboard`, `/vendor/shop`, `/vendor/inventory/*`, `/vendor/orders`, `/vendor/pickup`, `/vendor/customers`, `/vendor/receipts/*`, `/vendor/subscription/*`, `/vendor/payment-details`, `/vendor/sales`, `/vendor/notifications`, `/vendor/profile`, `/vendor/settings` |
| Admin | `/vendor/admin` for vendor applications, verification and shop activation; `/delivery/admin` for delivery request assignment; other platform administration is represented by `ROLE_POLICY` under `/admin/*` but requires dedicated UI/routes before it is functional |
| Delivery Partner | `/delivery/dashboard`; later availability, assigned-order detail, pickup/delivery history, earnings, notifications and settings belong under `/delivery/*` |

Route policy is only a navigation/UI aid. The server APIs remain the security boundary. No Postgres row-level security policies are currently installed; authorization and ownership are enforced by server middleware and scoped parameterized SQL, not database RLS. Commerce reads retain owner scoping; invoice bearer links are constrained to the signed order; vendor service SQL scopes vendor and shop IDs; delivery reads/status changes require both `DELIVERY_PARTNER` role and an assignment belonging to that partner; customer-triggered expiry reconciliation filters strictly to that customer.

## Conversion and assignment workflow

A customer submits `/vendor/application`; only Admin may approve/reject. Approval atomically grants `VENDOR`, creates the inactive/unverified shop and trial. `adminSetUserRole` cannot grant `VENDOR`; vendor conversion stays in the application workflow. Customers may request delivery for their own eligible paid order; Admins review pending requests at `/delivery/admin` and may assign only to accounts whose database role is `DELIVERY_PARTNER`, for orders still paid and ready.

## Intentionally pending

Role policy covers the requested surface, but not every baseline is implemented. Existing Admin operations remain partial; admin management pages for users, payments, settlements, refunds, delivery partner management, analytics, settings and general audit logs are not present. Delivery availability, partner earnings/history and fuller partner notifications remain pending. Vendor checkout-scoped orders, pickup, receipts, paid subscriptions, settlements and payout records remain intentionally unavailable until their secure commerce integrations exist. Do not treat route policy declarations as implemented screens or business features.

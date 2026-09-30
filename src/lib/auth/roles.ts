/** Canonical application roles. Keep these values aligned with user_profiles.role. */
export const APP_ROLES = ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_POLICY: Record<AppRole, { displayName: string; responsibilities: string[]; permissions: string[]; routePrefixes: string[] }> = {
  USER: {
    displayName: "User / Customer",
    responsibilities: ["Browse the marketplace", "Manage personal cart, checkout, orders, receipts, profile, and settings", "Submit a vendor application"],
    permissions: ["catalog:read", "cart:own", "checkout:own", "orders:own", "receipts:own", "notifications:own", "settings:own", "profile:own", "vendor-application:create"],
    routePrefixes: ["/", "/about", "/privacy", "/terms", "/services", "/products", "/cart", "/checkout", "/orders", "/order-success", "/invoice", "/profile", "/notifications", "/settings", "/vendor/application", "/delivery/request"],
  },
  VENDOR: {
    displayName: "Vendor",
    responsibilities: ["Manage the approved shop and its inventory", "View only shop-scoped business information", "Fulfil only shop-owned orders when shop checkout is enabled"],
    permissions: ["vendor:shop:own", "vendor:inventory:own", "vendor:orders:own", "vendor:receipts:own", "vendor:subscription:own", "vendor:financials:own", "notifications:own", "settings:own", "profile:own"],
    routePrefixes: ["/vendor/dashboard", "/vendor/shop", "/vendor/inventory", "/vendor/orders", "/vendor/pickup", "/vendor/customers", "/vendor/receipts", "/vendor/subscription", "/vendor/payment-details", "/vendor/sales", "/vendor/notifications", "/vendor/profile", "/vendor/settings"],
  },
  ADMIN: {
    displayName: "Admin",
    responsibilities: ["Manage platform users, catalog, commerce, vendors, delivery partners, and operations", "Review vendor applications and control shop verification and activation", "Access platform-wide audit and analytics data"],
    permissions: ["platform:manage", "users:manage", "vendors:manage", "shops:manage", "catalog:manage", "services:manage", "orders:manage", "payments:manage", "receipts:manage", "subscriptions:manage", "settlements:manage", "refunds:manage", "delivery:manage", "notifications:manage", "analytics:read", "audit:read", "settings:manage"],
    routePrefixes: ["/admin", "/vendor/admin", "/delivery/admin"],
  },
  DELIVERY_PARTNER: {
    displayName: "Delivery Partner",
    responsibilities: ["Manage own availability and delivery profile", "View and update only orders assigned to this partner", "Review own delivery history and earnings"],
    permissions: ["delivery:assignments:own", "delivery:status:own", "delivery:profile:own", "delivery:earnings:own", "notifications:own", "settings:own"],
    routePrefixes: ["/delivery"],
  },
};

/** Exact role policy; public catalog/auth routes are deliberately outside RBAC. */
export function roleCanAccessPath(role: AppRole, pathname: string): boolean {
  if (pathname === "/" || pathname === "/login" || pathname === "/register" || pathname === "/forgot-password" || pathname.startsWith("/reset-password/")) return true;
  if (pathname.startsWith("/api/")) return false;
  return ROLE_POLICY[role].routePrefixes.some((prefix) => pathname === prefix || (prefix !== "/" && pathname.startsWith(`${prefix}/`)));
}

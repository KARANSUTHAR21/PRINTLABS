/** Canonical application roles. Keep these values aligned with user_profiles.role. */
export const APP_ROLES = ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_POLICY: Record<AppRole, { displayName: string; responsibilities: string[]; permissions: string[]; routePrefixes: string[] }> = {
  USER: {
    displayName: "User / Customer",
    responsibilities: ["Browse the marketplace", "Manage personal cart, checkout, orders, receipts, profile, and settings", "Submit a vendor application"],
    permissions: ["catalog:read", "cart:own", "checkout:own", "orders:own", "receipts:own", "notifications:own", "settings:own", "profile:own", "vendor-application:create"],
    routePrefixes: ["/cart", "/checkout", "/orders", "/order-success", "/invoice", "/profile", "/notifications", "/settings", "/vendor/application", "/delivery/request", "/login", "/register", "/forgot-password", "/reset-password"],
  },
  VENDOR: {
    displayName: "Vendor",
    responsibilities: ["Manage the approved shop and its inventory", "View only shop-scoped business information", "Fulfil only shop-owned orders when shop checkout is enabled"],
    permissions: ["vendor:shop:own", "vendor:inventory:own", "vendor:orders:own", "vendor:receipts:own", "vendor:subscription:own", "vendor:financials:own", "notifications:own", "settings:own", "profile:own"],
    routePrefixes: ["/vendor/dashboard", "/vendor/shop", "/vendor/inventory", "/vendor/orders", "/vendor/pickup", "/vendor/customers", "/vendor/receipts", "/vendor/subscription", "/vendor/payment-details", "/vendor/sales", "/vendor/notifications", "/vendor/profile", "/vendor/settings", "/vendor/support", "/profile", "/login", "/register", "/forgot-password", "/reset-password"],
  },
  ADMIN: {
    displayName: "Admin",
    responsibilities: ["Manage platform users, catalog, commerce, vendors, delivery partners, and operations", "Review vendor applications and control shop verification and activation", "Access platform-wide audit and analytics data"],
    permissions: ["platform:manage", "users:manage", "vendors:manage", "shops:manage", "catalog:manage", "services:manage", "orders:manage", "payments:manage", "receipts:manage", "subscriptions:manage", "settlements:manage", "refunds:manage", "delivery:manage", "notifications:manage", "analytics:read", "audit:read", "settings:manage"],
    routePrefixes: ["/admin", "/vendor/admin", "/delivery/admin", "/profile", "/login", "/register", "/forgot-password", "/reset-password"],
  },
  DELIVERY_PARTNER: {
    displayName: "Delivery Partner",
    responsibilities: ["Manage own availability and delivery profile", "View and update only orders assigned to this partner", "Review own delivery history and earnings"],
    permissions: ["delivery:assignments:own", "delivery:status:own", "delivery:profile:own", "delivery:earnings:own", "notifications:own", "settings:own"],
    routePrefixes: ["/delivery", "/profile", "/login", "/register", "/forgot-password", "/reset-password"],
  },
};

/** Pages intentionally available regardless of the signed-in account role. */
export const PUBLIC_ROUTE_PREFIXES = ["/", "/about", "/privacy", "/terms", "/services", "/products"] as const;

/** Explicit client route guards for pages whose components are role-scoped. */
export const ROUTE_ROLE_GUARDS: Record<string, readonly AppRole[]> = {
  "/cart": ["USER"],
  "/checkout": ["USER"],
  "/orders": ["USER"],
  "/orders/$orderId": ["USER"],
  "/order-success/$orderId": ["USER"],
  "/invoice/$orderId": ["USER", "ADMIN"],
  "/profile": ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"],
  "/vendor/application": ["USER"],
  "/vendor/admin": ["ADMIN"],
  "/vendor/dashboard": ["VENDOR", "ADMIN"],
  "/vendor/shop": ["VENDOR", "ADMIN"],
  "/vendor/inventory/": ["VENDOR", "ADMIN"],
  "/vendor/inventory/add": ["VENDOR", "ADMIN"],
  "/vendor/inventory/history": ["VENDOR", "ADMIN"],
  "/vendor/inventory/low-stock": ["VENDOR", "ADMIN"],
  "/vendor/inventory/stock": ["VENDOR", "ADMIN"],
  "/vendor/orders": ["VENDOR", "ADMIN"],
  "/vendor/pickup": ["VENDOR", "ADMIN"],
  "/vendor/customers": ["VENDOR", "ADMIN"],
  "/vendor/receipts": ["VENDOR", "ADMIN"],
  "/vendor/receipts/subscriptions": ["VENDOR", "ADMIN"],
  "/vendor/subscription": ["VENDOR", "ADMIN"],
  "/vendor/subscription/plans": ["VENDOR", "ADMIN"],
  "/vendor/subscription/payment-history": ["VENDOR", "ADMIN"],
  "/vendor/payment-details": ["VENDOR", "ADMIN"],
  "/vendor/sales": ["VENDOR", "ADMIN"],
  "/vendor/notifications": ["VENDOR", "ADMIN"],
  "/vendor/profile": ["VENDOR", "ADMIN"],
  "/vendor/settings": ["VENDOR", "ADMIN"],
  "/vendor/support": ["VENDOR", "ADMIN"],
  "/admin/": ["ADMIN"],
  "/admin/users": ["ADMIN"],
  "/admin/vendors": ["ADMIN"],
  "/admin/shops": ["ADMIN"],
  "/admin/products": ["ADMIN"],
  "/admin/services": ["ADMIN"],
  "/admin/orders": ["ADMIN"],
  "/admin/payments": ["ADMIN"],
  "/admin/refunds": ["ADMIN"],
  "/admin/subscriptions": ["ADMIN"],
  "/admin/delivery-partners": ["ADMIN"],
  "/admin/audit": ["ADMIN"],
  "/delivery/admin": ["ADMIN"],
  "/delivery/request": ["USER"],
  "/delivery/dashboard": ["DELIVERY_PARTNER"],
  "/delivery/orders": ["DELIVERY_PARTNER"],
  "/delivery/history": ["DELIVERY_PARTNER"],
  "/delivery/earnings": ["DELIVERY_PARTNER"],
  "/delivery/notifications": ["DELIVERY_PARTNER"],
  "/delivery/profile": ["DELIVERY_PARTNER"],
  "/delivery/settings": ["DELIVERY_PARTNER"],
  "/login": ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"],
  "/register": ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"],
  "/forgot-password": ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"],
  "/reset-password/$token": ["USER", "VENDOR", "ADMIN", "DELIVERY_PARTNER"],
} as const;

/** Exact role policy; API endpoints use their own server-side authorization. */
export function roleCanAccessPath(role: AppRole, pathname: string): boolean {
  if (pathname.startsWith("/api/")) return false;
  if (PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname === prefix || (prefix !== "/" && pathname.startsWith(`${prefix}/`)))) return true;
  const routeGuard = Object.entries(ROUTE_ROLE_GUARDS).find(([route]) => {
    if (route === "/admin/") return pathname === "/admin" || pathname === "/admin/";
    const routePattern = new RegExp(`^${route.replace(/\$[^/]+/g, "[^/]+")}/?$`);
    return routePattern.test(pathname);
  });
  if (routeGuard) return routeGuard[1].includes(role);
  return ROLE_POLICY[role].routePrefixes.some((prefix) => pathname === prefix || (prefix !== "/" && pathname.startsWith(`${prefix}/`)));
}

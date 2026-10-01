import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeRoot = path.join(root, "src", "routes");
const apiRoot = path.join(root, "src", "lib", "api");
const rolesSource = await readFile(path.join(root, "src", "lib", "auth", "roles.ts"), "utf8");
const { APP_ROLES, roleCanAccessPath } = await import("../src/lib/auth/roles.ts");
const testSource = await readFile(path.join(root, "scripts", "role-access.test.mjs"), "utf8");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [file] : [];
  }));
  return nested.flat();
}

function declaredRoutes(source) {
  return [...source.matchAll(/createFileRoute\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);
}

function normalizedRoute(route) {
  return route;
}

function rolePolicyEntries() {
  const match = rolesSource.match(/export const ROUTE_ROLE_GUARDS:[\s\S]*?=\s*\{([\s\S]*?)\n\} as const;/);
  assert.ok(match, "ROUTE_ROLE_GUARDS must remain a declared route authorization table");
  return new Map([...match[1].matchAll(/["']([^"']+)["']\s*:\s*\[([^\]]*)\]/g)].map(([, route, roles]) => [
    route,
    [...roles.matchAll(/["']([A-Z_]+)["']/g)].map(([, role]) => role),
  ]));
}

function parseServerFunctions(source) {
  const functions = new Map();
  const starts = [...source.matchAll(/export const (\w+)\s*=\s*createServerFn\(/g)];
  for (let index = 0; index < starts.length; index += 1) {
    const name = starts[index][1];
    const from = starts[index].index;
    const to = starts[index + 1]?.index ?? source.length;
    functions.set(name, source.slice(from, to));
  }
  return functions;
}

const routeFiles = await sourceFiles(routeRoot);
const registered = new Map();
for (const filename of routeFiles) {
  const source = await readFile(filename, "utf8");
  for (const route of declaredRoutes(source)) {
    const key = normalizedRoute(route);
    assert.ok(!registered.has(key), `duplicate registered route ${key}`);
    registered.set(key, { route, filename, source });
  }
}

const policy = rolePolicyEntries();
const publicRoutes = new Set(["/", "/about", "/privacy", "/terms", "/services", "/services/", "/services/$slug", "/products", "/products/", "/products/$id"]);
const authOnlyRoutes = new Set(["/api/auth/$", "/api/auth/config", "/api/payments/webhook", "/api/invoices/$orderId/pdf"]);
test("every registered UI route has exact role policy and matching component guard", () => {
  for (const [route, item] of registered) {
    if (route.startsWith("/api/")) {
      assert.ok(authOnlyRoutes.has(route), `${route} is missing an explicit API authorization review`);
      continue;
    }
    if (publicRoutes.has(item.route) || publicRoutes.has(route)) continue;
    const guard = policy.get(route) ?? policy.get(item.route);
    assert.ok(guard?.length, `${item.filename} registers ${route} without an explicit route-role policy`);
    if (route.startsWith("/admin/")) assert.deepEqual(guard, ["ADMIN"], `${route} must be Admin-only`);
    if (route.startsWith("/delivery/") && route !== "/delivery/request" && route !== "/delivery/admin") {
      assert.deepEqual(guard, ["DELIVERY_PARTNER"], `${route} must be Delivery Partner-only`);
    }
    if (route.startsWith("/vendor/") && route !== "/vendor/application") {
      assert.ok(guard.includes("VENDOR") || guard.includes("ADMIN"), `${route} must include vendor workspace roles`);
    }
    const hasExplicitGuard = /<RoleProtected\b/.test(item.source) || /<Protected\b/.test(item.source) ||
      /<(?:VendorShell|AdminShell|DeliveryShell)\b/.test(item.source) ||
      ["/login", "/register", "/forgot-password", "/reset-password/$token"].includes(route);
    assert.ok(hasExplicitGuard, `${item.filename} (${route}) is missing a client page guard`);

    const representativePath = route.replace(/\$[^/]+/g, "route-test");
    const expectedRoles = publicRoutes.has(route) || publicRoutes.has(item.route) ? APP_ROLES : guard;
    for (const role of APP_ROLES) {
      assert.equal(
        roleCanAccessPath(role, representativePath),
        expectedRoles.includes(role),
        `route ${route} disagrees with the role policy for ${role}`,
      );
    }
  }
  for (const route of policy.keys()) {
    const isAdminIndexAlias = route === "/admin" && registered.has("/admin/");
    assert.ok(registered.has(route) || isAdminIndexAlias, `stale role policy entry for unregistered route ${route}`);
  }
});

test("every exported server function has an explicit auth classification and protected functions have DB role middleware", async () => {
  const apiFiles = await sourceFiles(apiRoot);
  const exportedFunctions = new Map();
  for (const filename of apiFiles) {
    const source = await readFile(filename, "utf8");
    for (const [name, body] of parseServerFunctions(source)) exportedFunctions.set(name, { filename, body });
  }

  const intentionallyPublic = new Set([
    "fetchProducts", "fetchProduct", "fetchServices", "fetchService", "requestReset", "checkResetLink", "confirmReset",
    "requestRegistrationOtpFn", "verifyRegistrationOtpFn",
  ]);
  const intentionallyAuthOnly = new Set(["saveSignupProfile", "loadCurrentRole", "getSocialRegistrationStateFn", "completeSocialRegistrationFn"]);
  const intentionallyVendorApplicantOnly = new Set(["applyForVendor"]);
  const intentionallyCustomerOrAdminOnly = new Set(["loadOrder", "loadInvoice"]);
  const intentionallyCustomerOnly = new Set([
    "loadCart", "addToCart", "updateCartItem", "deleteCartItem", "emptyCart", "mergeCart", "placeOrder",
    "loadOrders", "loadPendingOrder", "loadOrder", "startPayment", "verifyPayment", "completeSandboxPayment",
    "markPaymentOpen", "cancelPendingOrder", "loadPaymentStatus", "reconcilePayments", "requestDeliveryAssignment",
  ]);
  const classifications = new Map();
  for (const [name, { body }] of exportedFunctions) {
    const roleMiddleware = body.match(/\.middleware\(\[requireRoleMiddleware\(([^)]*)\)\]\)/s);
    if (roleMiddleware) {
      const roles = [...roleMiddleware[1].matchAll(/["']([A-Z_]+)["']/g)].map(([, role]) => role);
      assert.ok(roles.length, `${name} has empty role middleware`);
      classifications.set(name, `role:${roles.join(",")}`);
    } else if (/\.middleware\(\[requireVendorApplicantMiddleware\]\)/s.test(body)) {
      classifications.set(name, "authenticated-vendor-applicant");
      assert.ok(intentionallyVendorApplicantOnly.has(name), `${name} requires vendor applicant middleware without explicit classification`);
    } else if (/\.middleware\(\[requireCustomerOrAdminMiddleware\]\)/s.test(body)) {
      classifications.set(name, "authenticated-customer-or-admin");
      assert.ok(intentionallyCustomerOrAdminOnly.has(name), `${name} requires customer/admin middleware without explicit classification`);
    } else if (/\.middleware\(\[requireCustomerMiddleware\]\)/s.test(body)) {
      classifications.set(name, "authenticated-customer");
      assert.ok(intentionallyCustomerOnly.has(name), `${name} requires customer-account middleware without explicit classification`);
    } else if (/\.middleware\(\[authMiddleware\]\)/s.test(body)) {
      classifications.set(name, "authenticated-user");
      assert.ok(intentionallyAuthOnly.has(name), `${name} uses auth-only middleware without explicit classification`);
    } else {
      classifications.set(name, "public");
      assert.ok(intentionallyPublic.has(name), `${name} has no auth middleware and is not explicitly classified public`);
    }
  }
  for (const name of [...intentionallyPublic, ...intentionallyAuthOnly, ...intentionallyCustomerOnly, ...intentionallyVendorApplicantOnly, ...intentionallyCustomerOrAdminOnly]) {
    assert.ok(exportedFunctions.has(name), `authorization classification references missing server function ${name}`);
  }
  assert.ok(exportedFunctions.size >= 50, `authorization scan unexpectedly covered only ${exportedFunctions.size} server functions`);
});

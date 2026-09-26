import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

/**
 * Public order identifier: `PH-<base36 timestamp>-<random hex>`.
 *
 * Deliberately NOT a hash — the id is a reference, not a credential. It hides
 * nothing (timestamp + entropy only), and every order lookup re-checks
 * ownership server-side (`getOrderForUser` scopes by `user_id` behind
 * `authMiddleware`), so a guessed id is worthless without the session that
 * owns it. Hashing would also break the Razorpay `receipt` field (40-char cap)
 * and every URL/webhook that carries the id. The 40-bit random suffix keeps
 * enumeration and collisions infeasible without auth.
 */
export function newPublicOrderId(): string {
  const n = Date.now().toString(36).toUpperCase();
  const r = randomBytes(5).toString("hex").toUpperCase();
  return `PH-${n}-${r}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function hashIdempotency(endpoint: string, body: unknown): string {
  return sha256(`${endpoint}:${JSON.stringify(body)}`);
}

export function newClientKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

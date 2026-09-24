const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const start = now - windowMs;
  const prev = buckets.get(key) ?? [];
  const next = prev.filter((t) => t > start);
  if (next.length >= max) {
    buckets.set(key, next);
    return false;
  }
  next.push(now);
  buckets.set(key, next);
  return true;
}

export function clientKey(userId: string | undefined, extra: string): string {
  return `${userId ?? "anon"}:${extra}`;
}

type Entry<T> = { value: T; expires: number };

const memory = new Map<string, Entry<unknown>>();

const DEFAULT_TTL_MS = 30_000;

export async function cacheGet<T>(key: string): Promise<T | null> {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    memory.delete(key);
    return null;
  }
  return hit.value as T;
}

export async function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  memory.set(key, { value, expires: Date.now() + ttlMs });
}

export async function cacheDel(prefixOrKey: string): Promise<void> {
  for (const key of [...memory.keys()]) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) memory.delete(key);
  }
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  try {
    const existing = await cacheGet<T>(key);
    if (existing !== null) return existing;
    const value = await loader();
    await cacheSet(key, value, ttlMs);
    return value;
  } catch {
    return loader();
  }
}

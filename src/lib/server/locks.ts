/**
 * Simple in-memory lock mechanism for coordinating async operations.
 * This is a basic implementation suitable for development and single-instance deployments.
 * For production multi-instance deployments, consider using Redis or a distributed lock service.
 */

const locks = new Map<string, Promise<void>>();

export async function withLock<T>(
  key: string,
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T> {
  // Wait for any existing lock on this key
  while (locks.has(key)) {
    await locks.get(key);
  }

  // Create a new lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  locks.set(key, lockPromise);

  // Set up timeout
  const timeoutId = setTimeout(() => {
    // Auto-release lock after timeout
    locks.delete(key);
    releaseLock!();
  }, timeoutMs);

  try {
    // Execute the function
    const result = await fn();
    return result;
  } finally {
    // Release the lock
    clearTimeout(timeoutId);
    locks.delete(key);
    releaseLock!();
  }
}

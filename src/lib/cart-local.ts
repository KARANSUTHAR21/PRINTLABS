/**
 * Legacy guest-cart storage. Cart mutations are signed-in only now; this module
 * remains so a guest cart saved by an older build can still be **merged** into
 * the user's server cart right after sign-in (see `CartProvider`). Nothing
 * writes to the key anymore — `read` + `clear` are all that survive.
 */
const KEY = "printhub.guest-cart.v1";

export type GuestLine = { productId: string; quantity: number };

export function readGuestCart(): GuestLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GuestLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l) => l && typeof l.productId === "string" && l.quantity > 0);
  } catch {
    return [];
  }
}

export function clearGuestCart() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

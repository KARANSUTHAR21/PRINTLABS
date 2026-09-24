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

export function writeGuestCart(items: GuestLine[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function clearGuestCart() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function upsertGuest(productId: string, quantity: number, mode: "add" | "set"): GuestLine[] {
  const items = readGuestCart();
  const idx = items.findIndex((l) => l.productId === productId);
  let next = items;
  if (mode === "add") {
    if (idx >= 0) {
      next = items.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + quantity } : l));
    } else {
      next = [...items, { productId, quantity }];
    }
  } else if (quantity <= 0) {
    next = items.filter((l) => l.productId !== productId);
  } else if (idx >= 0) {
    next = items.map((l, i) => (i === idx ? { ...l, quantity } : l));
  } else {
    next = [...items, { productId, quantity }];
  }
  writeGuestCart(next);
  return next;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  addToCart,
  deleteCartItem,
  loadCart,
  mergeCart,
  updateCartItem,
} from "@/lib/api/commerce";
import { clearGuestCart, readGuestCart } from "@/lib/cart-local";
import { safeNextPath } from "@/lib/utils";
import type { CartView } from "@/lib/server/cart";

const empty: CartView = {
  items: [],
  subtotalPaise: 0,
  taxPaise: 0,
  totalPaise: 0,
  count: 0,
};

type CartCtx = {
  cart: CartView;
  loading: boolean;
  /** Resolves `true` only when the item is actually in the server cart. */
  add: (productId: string, quantity?: number) => Promise<boolean>;
  setQty: (productId: string, quantity: number) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Cart mutations are for signed-in users only. An unauthenticated visitor who
 * taps "Add to Cart" is sent to sign-in with `next` pointed back at the page
 * they were on, so they land where the tap happened after authenticating.
 * Gating on the hook's `user` (resolved post-`isPending`) matches how the
 * header's SignedIn/SignedOut gate — sign-out does a full-page reload, so the
 * state is never stale-truthy afterwards.
 */
function useRequireAuth() {
  const navigate = useNavigate();
  return useCallback(() => {
    toast.error("Please sign in to add items to your cart.");
    const here =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    void navigate({ to: "/login", search: { next: safeNextPath(here) } });
  }, [navigate]);
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const requireAuth = useRequireAuth();
  const [cart, setCart] = useState<CartView>(empty);
  const [loading, setLoading] = useState(true);

  /** Signed-out visitors see an empty cart — nothing writable, nothing fetchable. */
  const refresh = useCallback(async () => {
    if (!user) {
      setCart(empty);
      setLoading(false);
      return;
    }
    const res = await loadCart();
    if (res.success) setCart(res.cart);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (isPending) return;
    let cancelled = false;
    (async () => {
      if (user) {
        const guest = readGuestCart();
        if (guest.length) {
          const merged = await mergeCart({ data: { items: guest } });
          if (!cancelled && merged.success) {
            clearGuestCart();
            setCart(merged.cart);
            setLoading(false);
            return;
          }
        }
      }
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, user, refresh]);

  const add = useCallback(
    async (productId: string, quantity = 1): Promise<boolean> => {
      // Unauthenticated visitors cannot add items — route them to sign-in.
      if (!user) {
        requireAuth();
        return false;
      }
      const res = await addToCart({ data: { productId, quantity } });
      if (!res.success) {
        toast.error(res.message);
        return false;
      }
      setCart(res.cart);
      toast.success("Added to cart");
      return true;
    },
    [requireAuth, user],
  );

  const setQty = useCallback(
    async (productId: string, quantity: number) => {
      if (!user) {
        requireAuth();
        return;
      }
      const res = await updateCartItem({ data: { productId, quantity } });
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      setCart(res.cart);
    },
    [requireAuth, user],
  );

  const remove = useCallback(
    async (productId: string) => {
      if (!user) {
        requireAuth();
        return;
      }
      const res = await deleteCartItem({ data: { productId } });
      if (res.success) setCart(res.cart);
    },
    [requireAuth, user],
  );

  const value = useMemo(
    () => ({ cart, loading, add, setQty, remove, refresh }),
    [cart, loading, add, setQty, remove, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

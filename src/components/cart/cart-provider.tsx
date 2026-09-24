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
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  addToCart,
  deleteCartItem,
  loadCart,
  mergeCart,
  updateCartItem,
} from "@/lib/api/commerce";
import { fetchProduct } from "@/lib/api/public";
import { clearGuestCart, readGuestCart, upsertGuest } from "@/lib/cart-local";
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
  add: (productId: string, quantity?: number) => Promise<void>;
  setQty: (productId: string, quantity: number) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [cart, setCart] = useState<CartView>(empty);
  const [loading, setLoading] = useState(true);

  const hydrateGuest = useCallback(async () => {
    const lines = readGuestCart();
    if (lines.length === 0) {
      setCart(empty);
      return;
    }
    const items = [];
    for (const line of lines) {
      const res = await fetchProduct({ data: line.productId });
      if (!res.success) continue;
      const p = res.product;
      items.push({
        productId: p.id,
        name: p.name,
        image: p.image,
        unitPricePaise: p.price_paise,
        quantity: line.quantity,
        linePaise: p.price_paise * line.quantity,
        stock: p.stock,
      });
    }
    const subtotalPaise = items.reduce((s, i) => s + i.linePaise, 0);
    setCart({
      items,
      subtotalPaise,
      taxPaise: 0,
      totalPaise: subtotalPaise,
      count: items.reduce((s, i) => s + i.quantity, 0),
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      await hydrateGuest();
      setLoading(false);
      return;
    }
    const res = await loadCart();
    if (res.success) setCart(res.cart);
    setLoading(false);
  }, [hydrateGuest, user]);

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
    async (productId: string, quantity = 1) => {
      if (!user) {
        upsertGuest(productId, quantity, "add");
        await hydrateGuest();
        toast.success("Added to cart");
        return;
      }
      const res = await addToCart({ data: { productId, quantity } });
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      setCart(res.cart);
      toast.success("Added to cart");
    },
    [hydrateGuest, user],
  );

  const setQty = useCallback(
    async (productId: string, quantity: number) => {
      if (!user) {
        upsertGuest(productId, quantity, "set");
        await hydrateGuest();
        return;
      }
      const res = await updateCartItem({ data: { productId, quantity } });
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      setCart(res.cart);
    },
    [hydrateGuest, user],
  );

  const remove = useCallback(
    async (productId: string) => {
      if (!user) {
        upsertGuest(productId, 0, "set");
        await hydrateGuest();
        return;
      }
      const res = await deleteCartItem({ data: { productId } });
      if (res.success) setCart(res.cart);
    },
    [hydrateGuest, user],
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

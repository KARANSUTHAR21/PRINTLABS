import { Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { formatINR } from "@/lib/money";
import { useCart } from "./cart-provider";

export function CartPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { cart } = useCart();
  return (
    <div className="w-[21.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-paper p-6 shadow-pop">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-ink">
          <ShoppingCart className="size-[1.25rem]" strokeWidth={1.8} />
          <h3 className="text-[1.25rem] font-bold">Your Bill</h3>
        </div>
        <span className="shrink-0 text-[0.875rem] text-muted">{cart.count} items</span>
      </div>
      {cart.items.length === 0 ? (
        <p className="py-8 text-sm text-muted">
          Your cart is empty. Add prints or stationery to get started.
        </p>
      ) : (
        <ul className="mt-8 space-y-8">
          {cart.items.map((item) => (
            <li key={item.productId} className="flex items-center gap-3.5">
              <img
                src={item.image}
                alt=""
                className="size-11 shrink-0 rounded-lg object-cover bg-mist"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-bold leading-tight text-ink">
                  {item.name}
                </p>
                <p className="mt-1 text-[0.8125rem] text-muted">
                  {item.quantity} × {formatINR(item.unitPricePaise)}
                </p>
              </div>
              <p className="shrink-0 text-[0.95rem] font-bold tabular-nums text-ink">
                {formatINR(item.linePaise)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-12 space-y-2.5 border-t border-line pt-5 text-[0.95rem]">
        <div className="flex justify-between text-muted">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatINR(cart.subtotalPaise)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>Tax (0%)</span>
          <span className="tabular-nums">{formatINR(cart.taxPaise)}</span>
        </div>
      </div>
      <div className="mt-7 flex justify-between border-t border-line pt-4 text-[1.25rem] font-extrabold text-ink">
        <span>Total</span>
        <span className="tabular-nums">{formatINR(cart.totalPaise)}</span>
      </div>
      <Link to="/checkout" onClick={onNavigate} className="btn-navy mt-6 w-full">
        Proceed to Checkout
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

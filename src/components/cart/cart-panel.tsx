import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Copy, Minus, ShoppingCart, X } from "lucide-react";
import { formatINR } from "@/lib/money";
import { useCart } from "./cart-provider";

/**
 * Control strip on the floating cart — the three window controls from the
 * reference mock:
 *
 *   —  minimise: collapse the panel to a slim bar (toggle; click the bar to
 *      expand again),
 *   ❐  maximise: open the full `/cart` page,
 *   ✕  close:    dismiss the panel.
 *
 * The glyphs are lucide icons painted with the app's own tokens
 * (`text-muted`, `hover:text-ink`, `hover:bg-canvas`), never baked-in colours,
 * so they stay legible whatever the surface behind them is.
 */
const CONTROL =
  "grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink";

export function CartPanel({
  onNavigate,
  onClose,
}: {
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const { cart } = useCart();
  const [collapsed, setCollapsed] = useState(false);

  const controls = (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        className={CONTROL}
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? "Restore cart panel" : "Minimise cart panel"}
        title={collapsed ? "Restore" : "Minimise"}
      >
        <Minus className="size-3.5" />
      </button>
      <Link
        to="/cart"
        className={CONTROL}
        onClick={onNavigate}
        aria-label="Open the full cart page"
        title="Maximise — open the cart page"
      >
        {/* Two stacked rectangles: the maximise glyph in the reference mock. */}
        <Copy className="size-3.5" />
      </Link>
      <button
        type="button"
        className={CONTROL}
        onClick={onClose}
        aria-label="Close cart"
        title="Close"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );

  /** Minimised: a slim bar that restores the panel when clicked. */
  if (collapsed) {
    return (
      <div className="flex w-[21.5rem] max-w-[calc(100vw-2rem)] items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-2.5 shadow-pop">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-ink"
          onClick={() => setCollapsed(false)}
          aria-label="Expand cart panel"
        >
          <ShoppingCart className="size-[1.1rem] shrink-0" strokeWidth={1.8} />
          <span className="truncate text-[1.05rem] font-bold">Your Bill</span>
          <span className="shrink-0 text-[0.8125rem] text-muted">{cart.count} items</span>
        </button>
        {controls}
      </div>
    );
  }

  return (
    <div className="w-[21.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-paper p-6 shadow-pop">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 text-ink">
          <ShoppingCart className="size-[1.25rem] shrink-0" strokeWidth={1.8} />
          <h3 className="truncate text-[1.25rem] font-bold">Your Bill</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[0.875rem] text-muted">{cart.count} items</span>
          {controls}
        </div>
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/components/cart/cart-provider";
import { formatINR } from "@/lib/money";

export const Route = createFileRoute("/cart")({ component: CartPage });

function CartPage() {
  const { cart, setQty, remove, loading } = useCart();
  return (
    <main className="container-page py-12">
      <h1 className="text-3xl font-extrabold">Your Bill</h1>
      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading cart…</p>
      ) : cart.items.length === 0 ? (
        <div className="mt-8 card-surface p-8">
          <p className="text-muted">Your cart is empty.</p>
          <Link to="/products" className="btn-primary mt-4">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <ul className="space-y-4">
            {cart.items.map((item) => (
              <li key={item.productId} className="card-surface flex items-center gap-4 p-4">
                <img src={item.image} alt="" className="size-20 rounded-2xl object-cover bg-mist" />
                <div className="min-w-0 flex-1">
                  <Link to="/products/$id" params={{ id: item.productId }} className="font-semibold">
                    {item.name}
                  </Link>
                  <p className="text-sm text-muted">{formatINR(item.unitPricePaise)} each</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full border border-line"
                      onClick={() => void setQty(item.productId, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="w-8 text-center tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-full border border-line"
                      onClick={() => void setQty(item.productId, item.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-muted hover:text-danger"
                      onClick={() => void remove(item.productId)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <p className="font-bold tabular-nums">{formatINR(item.linePaise)}</p>
              </li>
            ))}
          </ul>
          <aside className="card-surface h-fit p-6">
            <h2 className="font-bold">Summary</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span className="tabular-nums text-ink">{formatINR(cart.subtotalPaise)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Tax (0%)</span>
                <span className="tabular-nums text-ink">{formatINR(cart.taxPaise)}</span>
              </div>
              <div className="flex justify-between pt-2 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatINR(cart.totalPaise)}</span>
              </div>
            </div>
            <Link to="/products" className="btn-outline mt-6 w-full">
              Continue Shopping
            </Link>
            <Link to="/checkout" className="btn-navy mt-3 w-full">
              Proceed to Checkout
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}

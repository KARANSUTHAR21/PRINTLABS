import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { formatINR } from "@/lib/money";
import type { ProductRow } from "@/lib/server/catalog";
import { useCart } from "@/components/cart/cart-provider";

export function ProductCard({ product }: { product: ProductRow }) {
  const { add } = useCart();
  return (
    <article className="card-surface flex h-full flex-col overflow-hidden">
      <Link to="/products/$id" params={{ id: product.id }} className="block">
        <img src={product.image} alt={product.name} className="card-media" />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <Link to="/products/$id" params={{ id: product.id }}>
          <h3 className="text-[1rem] font-bold leading-tight text-ink">{product.name}</h3>
          <p className="mt-1.5 text-[0.875rem] leading-snug text-muted">{product.description}</p>
        </Link>
        <p className="mt-3 text-[1.125rem] font-extrabold tabular-nums text-ink">
          {formatINR(product.price_paise)}
        </p>
        <button
          type="button"
          className="btn-outline mt-4 min-h-10 w-full text-[0.875rem]"
          onClick={() => void add(product.id, 1)}
        >
          <ShoppingCart className="size-4" />
          Add to Cart
        </button>
      </div>
    </article>
  );
}

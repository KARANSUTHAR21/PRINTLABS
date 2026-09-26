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
        <img src={product.image} alt={product.name} className="card-media card-media-tall" />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link to="/products/$id" params={{ id: product.id }}>
          <h3 className="text-[0.95rem] font-bold leading-tight text-ink">{product.name}</h3>
          <p className="mt-1 text-[0.8rem] leading-snug text-muted">{product.description}</p>
        </Link>
        <p className="mt-3 text-[1.05rem] font-extrabold tabular-nums text-ink">
          {formatINR(product.price_paise)}
        </p>
        <button
          type="button"
          className="btn-outline mt-4 min-h-8 w-full text-[0.8rem]"
          onClick={() => void add(product.id, 1)}
        >
          <ShoppingCart className="size-4" />
          Add to Cart
        </button>
      </div>
    </article>
  );
}

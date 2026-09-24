import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { fetchProduct, fetchProducts } from "@/lib/api/public";
import { useCart } from "@/components/cart/cart-provider";
import { ProductCard } from "@/components/product/product-card";
import { formatINR } from "@/lib/money";
import type { ProductRow } from "@/lib/server/catalog";

export const Route = createFileRoute("/products/$id")({ component: ProductDetails });

function ProductDetails() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [related, setRelated] = useState<ProductRow[]>([]);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    setProduct(null);
    void fetchProduct({ data: id }).then((res) => {
      if (!res.success) {
        setError(res.message);
        return;
      }
      setProduct(res.product);
      void fetchProducts({ data: { category: res.product.category } }).then((list) => {
        if (list.success) {
          setRelated(list.products.filter((p) => p.id !== res.product.id).slice(0, 4));
        }
      });
    });
  }, [id]);

  if (error) return <main className="container-page py-20 text-sm text-danger">{error}</main>;
  if (!product) return <main className="container-page py-20 text-sm text-muted">Loading…</main>;

  const inStock = product.stock > 0;

  return (
    <main className="container-page py-12">
      <div className="grid gap-10 lg:grid-cols-2">
        <img src={product.image} alt={product.name} className="w-full rounded-3xl object-cover bg-mist" />
        <div>
          <p className="text-sm font-medium text-muted">{product.category}</p>
          <h1 className="mt-2 text-4xl font-extrabold">{product.name}</h1>
          <p className="mt-3 text-muted">{product.description}</p>
          <p className="mt-6 text-3xl font-extrabold tabular-nums">{formatINR(product.price_paise)}</p>
          <p className="mt-2 text-sm text-muted">
            {inStock ? `${product.stock} in stock` : "Currently out of stock"}
          </p>
          <div className="mt-6 flex items-center gap-3">
            <label className="text-sm font-medium">
              Qty
              <input
                type="number"
                min={1}
                max={product.stock}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="ml-2 w-20 rounded-xl border border-line px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-outline"
              disabled={!inStock}
              onClick={() => void add(product.id, qty)}
            >
              Add to Cart
            </button>
            <button
              type="button"
              className="btn-navy"
              disabled={!inStock}
              onClick={async () => {
                await add(product.id, qty);
                void navigate({ to: "/checkout" });
              }}
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-extrabold">Related products</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
      <p className="mt-10 text-sm">
        <Link to="/products" className="text-primary">
          ← Back to products
        </Link>
      </p>
    </main>
  );
}

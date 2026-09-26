import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import { fetchProducts } from "@/lib/api/public";
import { PageHero, TrustBar } from "@/components/layout/page-hero";
import { ProductCard } from "@/components/product/product-card";
import { CATEGORIES, type ProductRow } from "@/lib/server/catalog";
import { cn } from "@/lib/utils";

type Search = { search?: string; category?: string; sort?: "latest" | "price_asc" | "price_desc" };

export const Route = createFileRoute("/products/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    search: typeof s.search === "string" ? s.search : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    sort:
      s.sort === "price_asc" || s.sort === "price_desc" || s.sort === "latest"
        ? s.sort
        : undefined,
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [error, setError] = useState("");
  const category = search.category ?? "All Products";
  const sort = search.sort ?? "latest";

  useEffect(() => {
    setProducts(null);
    void fetchProducts({
      data: { search: search.search, category, sort },
    }).then((res) => {
      if (res.success) setProducts(res.products);
      else setError(res.message);
    });
  }, [search.search, category, sort]);

  const title = useMemo(
    () => (search.search ? `Results for “${search.search}”` : "Our Products"),
    [search.search],
  );

  return (
    <main>
      <PageHero
        eyebrow="Quality products. Everyday."
        titleClassName="lg:text-[3.5rem]"
        title={
          <>
            Stationery,
            <br />
            Prints and More
          </>
        }
        description="Carefully selected products to keep you organized, creative and productive."
        action={
          <a href="#catalog" className="btn-primary">
            Browse All Products
            <ArrowRight className="size-4" />
          </a>
        }
        image="/images/hero-products.jpg"
        features={[
          { icon: "shield", label: "Trusted Quality" },
          { icon: "truck", label: "Fast Delivery" },
          { icon: "tag", label: "Great Value" },
        ]}
      />
      <section id="catalog" className="container-page py-8">
        <div className="mb-4 grid items-center gap-5 lg:grid-cols-[auto_1fr_auto]">
          <h2 className="text-[1.65rem] font-extrabold tracking-tight">{title}</h2>
          <div className="flex flex-wrap items-center gap-1 justify-self-start lg:justify-self-center">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                data-active={category === c}
                onClick={() => void navigate({ search: (prev) => ({ ...prev, category: c }) })}
                className={cn("pill", category !== c && "text-ink/80")}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 justify-self-start text-[0.95rem] text-muted lg:justify-self-end">
            Sort by
            <span className="relative inline-flex items-center">
              <select
                className="cursor-pointer appearance-none bg-transparent py-1 pl-1 pr-6 text-[0.95rem] font-semibold text-ink"
                value={sort}
                onChange={(e) =>
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      sort: e.target.value as Search["sort"],
                    }),
                  })
                }
              >
                <option value="latest">Latest</option>
                <option value="price_asc">Price Low to High</option>
                <option value="price_desc">Price High to Low</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 size-4 text-ink" />
            </span>
          </label>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {products === null && !error && <p className="text-sm text-muted">Loading products…</p>}
        {products && products.length === 0 && (
          <p className="text-sm text-muted">No products found.</p>
        )}
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {products?.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <div className="mt-5 pb-8">
        <TrustBar
          items={[
            { icon: "truck", title: "Quick Delivery", hint: "Get your products fast" },
            { icon: "shield", title: "Quality Assurance", hint: "Only the best, always" },
            { icon: "leaf", title: "Sustainable Choices", hint: "Eco-friendly options" },
            { icon: "gift", title: "Bulk & Custom Orders", hint: "For schools, offices & businesses" },
          ]}
        />
      </div>
    </main>
  );
}

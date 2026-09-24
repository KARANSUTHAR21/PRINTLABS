import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { fetchProducts } from "@/lib/api/public";
import { formatINR } from "@/lib/money";
import type { ProductRow } from "@/lib/server/catalog";

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetchProducts({ data: {} }).then((res) => {
      if (res.success) setProducts(res.products);
    });
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.description.toLowerCase().includes(s) ||
          p.category.toLowerCase().includes(s),
      )
      .slice(0, 8);
  }, [products, q]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content className="fixed left-1/2 top-[12%] z-50 w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-3xl border border-line bg-paper p-4 shadow-pop">
          <div className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2">
            <Search className="size-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search notebooks, prints, pens…"
              className="w-full bg-transparent text-sm text-ink outline-none"
            />
            <button type="button" onClick={() => onOpenChange(false)} aria-label="Close search">
              <X className="size-4 text-muted" />
            </button>
          </div>
          <Dialog.Title className="sr-only">Search products</Dialog.Title>
          <ul className="mt-3 max-h-80 space-y-1 overflow-auto">
            {results.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted">No products found.</li>
            ) : (
              results.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/products/$id"
                    params={{ id: p.id }}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-canvas"
                  >
                    <img src={p.image} alt="" className="size-12 rounded-xl object-cover bg-mist" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                      <p className="truncate text-xs text-muted">{p.description}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{formatINR(p.price_paise)}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

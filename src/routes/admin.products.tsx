import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { adminCreateProduct, adminListProducts, adminUpsertProduct } from "@/lib/api/admin";
import type { ProductRow } from "@/lib/server/catalog";

export const Route = createFileRoute("/admin/products")({ component: AdminProductsRoute });
const EMPTY = { name: "", description: "", category: "Paper & Printing", pricePaise: "", image: "/images/products/a4-paper.jpg", stock: "0" };
function AdminProductsRoute() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() { const result = await adminListProducts(); if (result.success) setProducts(result.products); else setError(result.message); }
  useEffect(() => { void refresh().catch(() => setError("Could not load products.")); }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const result = await adminCreateProduct({ data: { ...form, pricePaise: Number(form.pricePaise), stock: Number(form.stock) } }); if (!result.success) setError(result.message); else { setMessage("Product added to the catalog."); setForm(EMPTY); await refresh(); } }
    catch { setError("Could not create this product."); }
    finally { setBusy(false); }
  }
  async function toggle(product: ProductRow) {
    setBusy(true); setError("");
    try { const result = await adminUpsertProduct({ data: { id: product.id, active: !product.active } }); if (!result.success) setError(result.message); else await refresh(); }
    catch { setError("Could not update this product."); }
    finally { setBusy(false); }
  }
  return <AdminShell><AdminPageHeading title="Products" description="Manage the public global PrintHub catalog. Vendor shop pricing and stock remain separately scoped." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}{message && <p role="status" className="mb-4 text-sm text-success">{message}</p>}<form onSubmit={(event) => void create(event)} className="card-surface mb-6 grid gap-3 p-5 sm:grid-cols-2"><h2 className="font-bold sm:col-span-2">Add catalog product</h2><Field label="Name" value={form.name} set={(name) => setForm({ ...form, name })} /><Field label="Category" value={form.category} set={(category) => setForm({ ...form, category })} /><Field label="Description" value={form.description} set={(description) => setForm({ ...form, description })} /><Field label="Image path or URL" value={form.image} set={(image) => setForm({ ...form, image })} /><Field label="Price (paise)" value={form.pricePaise} set={(pricePaise) => setForm({ ...form, pricePaise })} type="number" /><Field label="Stock" value={form.stock} set={(stock) => setForm({ ...form, stock })} type="number" /><button className="btn-primary w-fit sm:col-span-2" disabled={busy}>Add product</button></form><section className="card-surface divide-y divide-line">{products.map((product) => <article key={product.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="font-semibold">{product.name}</p><p className="text-xs text-muted">{product.category} · {product.price_paise} paise · stock {product.stock}</p></div><button className="btn-outline min-h-9" disabled={busy} onClick={() => void toggle(product)}>{product.active ? "Deactivate" : "Activate"}</button></article>)}{products.length === 0 && <p className="p-8 text-sm text-muted">No catalog products found.</p>}</section></AdminShell>;
}
function Field({ label, value, set, type = "text" }: { label: string; value: string; set: (value: string) => void; type?: string }) { return <label className="text-sm font-medium">{label}<input className="field mt-1 w-full" required value={value} type={type} onChange={(event) => set(event.target.value)} /></label>; }

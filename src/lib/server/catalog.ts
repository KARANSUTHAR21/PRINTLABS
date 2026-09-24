import { getSql } from "@/lib/db";
import { cacheDel, cached } from "./cache";

export type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price_paise: number;
  image: string;
  stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ServiceRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  icon: string;
  sort_order: number;
  active: boolean;
};

export const CATEGORIES = [
  "All Products",
  "Paper & Printing",
  "Notebooks",
  "Writing",
  "Office Supplies",
  "Custom Prints",
] as const;

export async function listProducts(opts: {
  search?: string;
  category?: string;
  sort?: "latest" | "price_asc" | "price_desc";
}) {
  const key = `products:list:${opts.search ?? ""}:${opts.category ?? ""}:${opts.sort ?? "latest"}`;
  return cached(key, 20_000, async () => {
    const sql = await getSql();
    const search = opts.search?.trim().toLowerCase() ?? "";
    const category =
      opts.category && opts.category !== "All Products" ? opts.category : "";
    const rows = await sql<ProductRow>`
      select id, name, slug, description, category, price_paise, image, stock, active,
             created_at::text as created_at, updated_at::text as updated_at
      from products
      where active = true
        and (${category} = '' or category = ${category})
        and (
          ${search} = ''
          or lower(name) like ${"%" + search + "%"}
          or lower(description) like ${"%" + search + "%"}
          or lower(category) like ${"%" + search + "%"}
        )
      order by created_at desc
    `;
    const sorted = [...rows];
    if (opts.sort === "price_asc") sorted.sort((a, b) => a.price_paise - b.price_paise);
    if (opts.sort === "price_desc") sorted.sort((a, b) => b.price_paise - a.price_paise);
    return sorted;
  });
}

export async function getProduct(idOrSlug: string): Promise<ProductRow | null> {
  return cached(`products:${idOrSlug}`, 20_000, async () => {
    const sql = await getSql();
    const rows = await sql<ProductRow>`
      select id, name, slug, description, category, price_paise, image, stock, active,
             created_at::text as created_at, updated_at::text as updated_at
      from products
      where id = ${idOrSlug} or slug = ${idOrSlug}
      limit 1
    `;
    return rows[0] ?? null;
  });
}

export async function listServices() {
  return cached("services:list", 60_000, async () => {
    const sql = await getSql();
    return sql<ServiceRow>`
      select id, slug, title, subtitle, description, image, icon, sort_order, active
      from services
      where active = true
      order by sort_order asc
    `;
  });
}

export async function getService(idOrSlug: string): Promise<ServiceRow | null> {
  return cached(`services:${idOrSlug}`, 60_000, async () => {
    const sql = await getSql();
    const rows = await sql<ServiceRow>`
      select id, slug, title, subtitle, description, image, icon, sort_order, active
      from services
      where id = ${idOrSlug} or slug = ${idOrSlug}
      limit 1
    `;
    return rows[0] ?? null;
  });
}

export async function invalidateCatalog() {
  await cacheDel("products:");
  await cacheDel("services:");
}

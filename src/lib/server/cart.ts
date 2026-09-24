import { getSql } from "@/lib/db";
import { calcTotals } from "@/lib/money";
import { fail } from "./errors";
import { getProduct } from "./catalog";

export type CartLine = {
  productId: string;
  name: string;
  image: string;
  unitPricePaise: number;
  quantity: number;
  linePaise: number;
  stock: number;
};

export type CartView = {
  items: CartLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  count: number;
};

function toView(items: CartLine[]): CartView {
  const subtotalPaise = items.reduce((s, i) => s + i.linePaise, 0);
  const totals = calcTotals(subtotalPaise);
  return {
    items,
    ...totals,
    count: items.reduce((s, i) => s + i.quantity, 0),
  };
}

export async function getCart(userId: string): Promise<CartView> {
  const sql = await getSql();
  const rows = await sql<{
    product_id: string;
    quantity: number;
    name: string;
    image: string;
    price_paise: number;
    stock: number;
    active: boolean;
  }>`
    select c.product_id, c.quantity, p.name, p.image, p.price_paise, p.stock, p.active
    from cart_items c
    join products p on p.id = c.product_id
    where c.user_id = ${userId}
    order by c.updated_at desc
  `;
  const items: CartLine[] = rows
    .filter((r) => r.active)
    .map((r) => ({
      productId: r.product_id,
      name: r.name,
      image: r.image,
      unitPricePaise: r.price_paise,
      quantity: r.quantity,
      linePaise: r.price_paise * r.quantity,
      stock: r.stock,
    }));
  return toView(items);
}

export async function addCartItem(userId: string, productId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) fail("Quantity must be at least 1.", 422);
  const product = await getProduct(productId);
  if (!product || !product.active) fail("Product not found.", 404);
  const sql = await getSql();
  const existing = await sql<{ quantity: number }>`
    select quantity from cart_items where user_id = ${userId} and product_id = ${product.id}
  `;
  const nextQty = (existing[0]?.quantity ?? 0) + quantity;
  if (nextQty > product.stock) fail("Not enough stock for this item.", 409, "OUT_OF_STOCK");
  if (existing[0]) {
    await sql`
      update cart_items
      set quantity = ${nextQty}, updated_at = now()
      where user_id = ${userId} and product_id = ${product.id}
    `;
  } else {
    await sql`
      insert into cart_items (user_id, product_id, quantity)
      values (${userId}, ${product.id}, ${quantity})
    `;
  }
  return getCart(userId);
}

export async function setCartItem(userId: string, productId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) fail("Invalid quantity.", 422);
  if (quantity === 0) return removeCartItem(userId, productId);
  const product = await getProduct(productId);
  if (!product || !product.active) fail("Product not found.", 404);
  if (quantity > product.stock) fail("Not enough stock for this item.", 409, "OUT_OF_STOCK");
  const sql = await getSql();
  await sql`
    insert into cart_items (user_id, product_id, quantity)
    values (${userId}, ${product.id}, ${quantity})
    on conflict (user_id, product_id)
    do update set quantity = ${quantity}, updated_at = now()
  `;
  return getCart(userId);
}

export async function removeCartItem(userId: string, productId: string) {
  const sql = await getSql();
  await sql`delete from cart_items where user_id = ${userId} and product_id = ${productId}`;
  return getCart(userId);
}

export async function clearCart(userId: string) {
  const sql = await getSql();
  await sql`delete from cart_items where user_id = ${userId}`;
  return getCart(userId);
}

export async function mergeGuestCart(
  userId: string,
  guestItems: { productId: string; quantity: number }[],
) {
  for (const item of guestItems) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
    const product = await getProduct(item.productId);
    if (!product || !product.active) continue;
    const sql = await getSql();
    const existing = await sql<{ quantity: number }>`
      select quantity from cart_items where user_id = ${userId} and product_id = ${product.id}
    `;
    const merged = Math.min(product.stock, (existing[0]?.quantity ?? 0) + item.quantity);
    if (merged < 1) continue;
    await sql`
      insert into cart_items (user_id, product_id, quantity)
      values (${userId}, ${product.id}, ${merged})
      on conflict (user_id, product_id)
      do update set quantity = ${merged}, updated_at = now()
    `;
  }
  return getCart(userId);
}

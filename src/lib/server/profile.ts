import { getSql } from "@/lib/db";

export type Profile = {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  pincode: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
};

export async function ensureProfile(
  userId: string,
  seed?: { firstName?: string; lastName?: string },
): Promise<Profile> {
  const sql = await getSql();
  await sql`
    insert into user_profiles (user_id, first_name, last_name)
    values (${userId}, ${seed?.firstName ?? ""}, ${seed?.lastName ?? ""})
    on conflict (user_id) do nothing
  `;
  const rows = await sql<{
    user_id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    address_line: string | null;
    city: string | null;
    pincode: string | null;
    role: "USER" | "ADMIN";
    created_at: string;
  }>`
    select user_id, first_name, last_name, phone, address_line, city, pincode, role,
           created_at::text as created_at
    from user_profiles where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  return {
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    addressLine: row.address_line,
    city: row.city,
    pincode: row.pincode,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<Profile, "firstName" | "lastName" | "phone" | "addressLine" | "city" | "pincode">>,
) {
  const current = await ensureProfile(userId);
  const sql = await getSql();
  await sql`
    update user_profiles set
      first_name = ${patch.firstName ?? current.firstName},
      last_name = ${patch.lastName ?? current.lastName},
      phone = ${patch.phone ?? current.phone},
      address_line = ${patch.addressLine ?? current.addressLine},
      city = ${patch.city ?? current.city},
      pincode = ${patch.pincode ?? current.pincode},
      updated_at = now()
    where user_id = ${userId}
  `;
  return ensureProfile(userId);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const profile = await ensureProfile(userId);
  return profile.role === "ADMIN";
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeading, AdminShell } from "@/components/admin/admin-shell";
import { adminListUsers, adminSetUserRole } from "@/lib/api/admin";

export const Route = createFileRoute("/admin/users")({ component: AdminUsersRoute });
type UserRow = { userId: string; name: string; email: string; emailVerified: boolean; role: string; createdAt: string };

function AdminUsersRoute() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  async function refresh() {
    const result = await adminListUsers();
    if (result.success) setUsers(result.users); else setError(result.message);
  }
  useEffect(() => { void refresh().catch(() => setError("Could not load users.")); }, []);
  async function changeRole(userId: string, role: "USER" | "ADMIN" | "DELIVERY_PARTNER") {
    setBusy(userId); setError(""); setMessage("");
    try {
      const result = await adminSetUserRole({ data: { userId, role } });
      if (!result.success) setError(result.message);
      else { setMessage("User role updated."); await refresh(); }
    } catch { setError("Could not update this account role."); }
    finally { setBusy(""); }
  }
  return <AdminShell><AdminPageHeading title="Users" description="Manage platform roles. Vendor access is granted only by approving the vendor application." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}{message && <p role="status" className="mb-4 text-sm text-success">{message}</p>}<section className="card-surface overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-canvas text-xs text-muted"><tr>{["Account", "Verified", "Role", "Created", "Change role"].map((title) => <th key={title} className="px-4 py-3">{title}</th>)}</tr></thead><tbody>{users.map((user) => <tr key={user.userId} className="border-t border-line"><td className="px-4 py-3"><p className="font-semibold">{user.name}</p><p className="text-xs text-muted">{user.email}</p><p className="text-[10px] text-muted">{user.userId}</p></td><td className="px-4 py-3">{user.emailVerified ? "Verified" : "Unverified"}</td><td className="px-4 py-3 font-semibold">{user.role}</td><td className="px-4 py-3 text-muted">{new Date(user.createdAt).toLocaleDateString()}</td><td className="px-4 py-3"><select aria-label={`Role for ${user.email}`} className="field min-h-9" value={user.role} disabled={Boolean(busy) || user.role === "VENDOR"} onChange={(event) => void changeRole(user.userId, event.target.value as "USER" | "ADMIN" | "DELIVERY_PARTNER")}><option value="USER">USER</option><option value="ADMIN">ADMIN</option><option value="DELIVERY_PARTNER">DELIVERY_PARTNER</option></select></td></tr>)}</tbody></table>{users.length === 0 && <p className="p-8 text-sm text-muted">No user accounts found.</p>}</section><p className="mt-3 text-xs text-muted">User role changes are audited by the server. Existing Vendors cannot be demoted through this control.</p></AdminShell>;
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPageHeading, DeliveryShell } from "@/components/delivery/delivery-shell";
import { loadMyDeliveryNotifications, markMyDeliveryNotificationReadFn } from "@/lib/api/delivery";

type Notice = { id: string; eventType: string; title: string; message: string; readAt: string | null; createdAt: string };
export const Route = createFileRoute("/delivery/notifications")({ component: DeliveryNotificationsRoute });
function DeliveryNotificationsRoute() {
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  async function refresh() { const result = await loadMyDeliveryNotifications(); if (result.success) setNotifications(result.notifications); else setError(result.message); }
  useEffect(() => { void refresh().catch(() => setError("Could not load notifications.")); }, []);
  async function markRead(id: string) { const result = await markMyDeliveryNotificationReadFn({ data: { notificationId: id } }); if (!result.success) setError(result.message); else await refresh(); }
  return <DeliveryShell><DeliveryPageHeading title="Notifications" description="Notifications are restricted to the authenticated delivery partner and acknowledged only on that partner's own records." />{error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}<section className="card-surface divide-y divide-line">{notifications.map((notice) => <article key={notice.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{notice.title} {!notice.readAt && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-primary">New</span>}</p><p className="mt-1 text-sm text-muted">{notice.message}</p><p className="mt-1 text-xs text-muted">{new Date(notice.createdAt).toLocaleString()}</p></div>{!notice.readAt && <button className="btn-outline min-h-9" onClick={() => void markRead(notice.id)}>Mark read</button>}</article>)}{notifications.length === 0 && <p className="p-8 text-sm text-muted">No delivery notifications.</p>}</section></DeliveryShell>;
}

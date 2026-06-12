'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Notification, Paginated } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { RequireAuth } from '@/components/require-auth';
import { Button, Spinner } from '@/components/ui';

interface NotificationsData extends Paginated<Notification> {
  unreadCount: number;
}

function NotificationsList() {
  const router = useRouter();
  const [data, setData] = useState<NotificationsData | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    return api.get<NotificationsData>('/notifications', { limit: 50 }).then(setData).catch(() => setData(null));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function open(n: Notification) {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      setData((d) =>
        d
          ? { ...d, unreadCount: Math.max(0, d.unreadCount - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) }
          : d,
      );
    }
    if (n.reportId) router.push(`/reports/${n.reportId}`);
  }

  async function markAll() {
    await api.patch('/notifications/read-all').catch(() => {});
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          Notifications {data && data.unreadCount > 0 && (
            <span className="ml-1 rounded-full bg-teal-600 px-2 py-0.5 text-sm text-white">{data.unreadCount}</span>
          )}
        </h1>
        {data && data.unreadCount > 0 && (
          <Button variant="secondary" onClick={markAll}>Mark all read</Button>
        )}
      </div>

      {data && data.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => open(n)}
                className={`w-full rounded-md border p-3 text-left transition hover:bg-slate-50 ${
                  n.isRead ? 'border-slate-200 bg-white' : 'border-teal-200 bg-teal-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900">{n.title}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">No notifications yet.</p>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsList />
    </RequireAuth>
  );
}

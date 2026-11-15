'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Notification, Paginated } from '@/lib/types';
import { useFormat } from '@/lib/i18n/use-format';
import { queryKeys } from '@/lib/query-keys';
import { RequireAuth } from '@/components/require-auth';
import { useToast } from '@/components/toast';
import { Button, LoadError, PageHeader, Spinner } from '@/components/ui';
import { useErrorMessage } from '@/lib/i18n/use-error-message';

interface NotificationsData extends Paginated<Notification> {
  unreadCount: number;
}

/**
 * A notification's title and message for the reader (F5). English shows what
 * the server wrote; Bangla words a kinded notification from its params. Rows
 * stored before kinds keep their English.
 */
function useNotificationText(): (n: Notification) => { title: string; message: string } {
  const locale = useLocale();
  const t = useTranslations('notifications.kinds');
  const f = useFormat();
  return (n) => {
    if (locale === 'en') return { title: n.title, message: n.message };
    switch (n.kind) {
      case 'status_changed':
        return {
          title: t('status_changed.title'),
          message: t('status_changed.message', {
            reportTitle: n.params.reportTitle,
            status: f.status(n.params.status),
          }),
        };
      case 'report_merged':
        return {
          title: t('report_merged.title'),
          message: t('report_merged.message', n.params),
        };
      case 'fix_disputed':
        return { title: t('fix_disputed.title'), message: t('fix_disputed.message', n.params) };
      default:
        return { title: n.title, message: n.message };
    }
  };
}

function NotificationsList() {
  const wordOf = useNotificationText();
  const errorText = useErrorMessage();
  const t = useTranslations('notifications');
  const f = useFormat();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => api.get('/notifications', { limit: 50 }, { signal }),
  });
  const data = notifications.data;

  const markRead = useMutation({
    mutationFn: (n: Notification) => api.patch(`/notifications/${n.id}/read`),
    onSuccess: (_result, n) => {
      queryClient.setQueryData<NotificationsData>(queryKeys.notifications, (d) =>
        d
          ? {
              ...d,
              unreadCount: Math.max(0, d.unreadCount - 1),
              items: d.items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
            }
          : d,
      );
    },
    onError: (err) => toast(errorText(err, t('markReadFailed')), 'error'),
  });

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
    onError: (err) => toast(errorText(err, t('markAllFailed')), 'error'),
  });

  function open(n: Notification) {
    if (!n.isRead) markRead.mutate(n);
    if (n.reportId) router.push(`/reports/${n.reportId}`);
  }

  if (notifications.isPending) return <Spinner />;
  if (notifications.isError) {
    return <LoadError>{errorText(notifications.error, t('loadError'))}</LoadError>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={
          <>
            {t('title')}
            {data && data.unreadCount > 0 && (
              <span className="ml-2 align-middle rounded-full bg-teal-600 px-2 py-0.5 text-base font-semibold text-white">
                {f.number(data.unreadCount)}
              </span>
            )}
          </>
        }
        actions={
          data && data.unreadCount > 0 ? (
            <Button
              variant="secondary"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              {t('markAll')}
            </Button>
          ) : undefined
        }
      />

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
                  <span className="text-sm font-medium text-slate-900">{wordOf(n).title}</span>
                  <span className="text-xs text-slate-400">{f.dateTime(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{wordOf(n).message}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">{t('empty')}</p>
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

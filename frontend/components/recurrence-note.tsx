'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useFormat } from '@/lib/i18n/use-format';
import { queryKeys } from '@/lib/query-keys';

/**
 * Says so when this problem was reported and fixed here before (F4). Shows
 * nothing while loading or when there is nothing to say: it is a note, not a
 * section, but a failure is still shown.
 */
export function RecurrenceNote({ reportId }: { reportId: string }) {
  const t = useTranslations('recurrence');
  const f = useFormat();
  const query = useQuery({
    queryKey: queryKeys.recurrence(reportId),
    queryFn: ({ signal }) => api.get(`/reports/${reportId}/recurrence`, undefined, { signal }),
  });

  if (query.isPending) return null;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {errorMessage(query.error, t('loadError'))}
      </p>
    );
  }
  const { total, earlier, radiusM } = query.data;
  if (total === 0) return null;

  return (
    <section
      aria-labelledby="recurrence-heading"
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <h2 id="recurrence-heading" className="font-semibold">
        {t('heading')}
      </h2>
      <p className="mt-1">{t('summary', { count: total, radius: radiusM })}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {earlier.map((e) => (
          <li key={e.id}>
            {t.rich('item', {
              title: e.title,
              date: f.date(e.resolvedAt),
              distance: e.distanceM,
              link: (chunks) => (
                <Link
                  href={`/reports/${e.id}`}
                  className="font-medium underline hover:no-underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </li>
        ))}
      </ul>
      {total > earlier.length && <p className="mt-2">{t('cutShort', { shown: earlier.length })}</p>}
    </section>
  );
}

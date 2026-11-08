'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

/**
 * Says so when this problem was reported and fixed here before (F4). Shows
 * nothing while loading or when there is nothing to say: it is a note, not a
 * section, but a failure is still shown.
 */
export function RecurrenceNote({ reportId }: { reportId: string }) {
  const query = useQuery({
    queryKey: queryKeys.recurrence(reportId),
    queryFn: ({ signal }) => api.get(`/reports/${reportId}/recurrence`, undefined, { signal }),
  });

  if (query.isPending) return null;
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {errorMessage(query.error, 'Could not check for earlier reports here.')}
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
        This problem has come back
      </h2>
      <p className="mt-1">
        {total === 1
          ? `An earlier report of the same kind within ${String(radiusM)} m was fixed before this one was made.`
          : `${String(total)} earlier reports of the same kind within ${String(radiusM)} m were fixed before this one was made.`}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {earlier.map((e) => (
          <li key={e.id}>
            <Link href={`/reports/${e.id}`} className="font-medium underline hover:no-underline">
              {e.title}
            </Link>
            , fixed {formatDate(e.resolvedAt)}, {e.distanceM} m away
          </li>
        ))}
      </ul>
      {total > earlier.length && (
        <p className="mt-2">Showing the {earlier.length} most recently fixed.</p>
      )}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { hotspotCounts, hotspotKinds } from '@/lib/hotspots';
import { queryKeys } from '@/lib/query-keys';
import type { Hotspot } from '@/lib/types';
import { LoadError, Spinner } from './ui';

/** Reports named per hotspot in the list; the rest are on the map. */
const NAMED = 3;

/** Places where reports cluster, most reports first (F4). */
export function HotspotList({ onShow }: { onShow: (hotspot: Hotspot) => void }) {
  const query = useQuery({
    queryKey: queryKeys.hotspots,
    queryFn: ({ signal }) => api.get('/hotspots', undefined, { signal }),
  });

  return (
    <section aria-labelledby="hotspots-heading" className="flex max-w-3xl flex-col gap-3">
      <h2 id="hotspots-heading" className="text-xl font-semibold text-slate-900">
        Hotspots
      </h2>
      {query.isPending ? (
        <Spinner label="Loading hotspots…" />
      ) : query.isError ? (
        <LoadError>{errorMessage(query.error, 'Failed to load the hotspots.')}</LoadError>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Places with at least {query.data.minReports} reports within {query.data.radiusM} m of
            each other in the last {query.data.windowDays} days, fixed ones included. Most reports
            first.
          </p>
          {query.data.hotspots.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              No hotspots right now: no place has {query.data.minReports} or more reports this close
              together.
            </p>
          ) : (
            <ol className="divide-y divide-slate-100 border-t border-slate-200">
              {query.data.hotspots.map((h) => (
                <li
                  key={`${String(h.latitude)},${String(h.longitude)}`}
                  className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      {hotspotKinds(h)}
                      {h.recurring && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          Keeps coming back
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-600">
                      {hotspotCounts(h)} Latest {formatDate(h.latestReportAt)}.
                    </p>
                    <ul className="flex flex-col gap-0.5 text-sm">
                      {h.reports.slice(0, NAMED).map((r) => (
                        <li key={r.id} className="truncate">
                          <Link href={`/reports/${r.id}`} className="text-teal-700 hover:underline">
                            {r.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => onShow(h)}
                    className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Show on map
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

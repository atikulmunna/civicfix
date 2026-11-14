'use client';

import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useFormat, type Format } from '@/lib/i18n/use-format';
import { queryKeys } from '@/lib/query-keys';
import type { PriorityExplanation } from '@/lib/types';
import { Card, LoadError, Spinner } from '@/components/ui';

/** "+12", "-5", "0": points with their sign. */
export function formatPoints(points: number): string {
  return points > 0 ? `+${String(points)}` : String(points);
}

/** Each part of the score with the input behind it. */
function rows(p: PriorityExplanation, f: Format): [label: string, points: number][] {
  return [
    [`Severity (${f.severity(p.inputs.severity)})`, p.severity],
    [`Confirmations (${String(p.inputs.confirms)})`, p.confirmations],
    [`Days open (${String(p.daysOpen)})`, p.waiting],
    [`False-report flags (${String(p.inputs.falseReports)})`, p.flags],
    [`Reporter trust (${formatPoints(p.inputs.reporterTrust)})`, p.reporter],
  ];
}

/**
 * Why a report ranks where it does in triage (F1): each part of its score
 * and the input behind it, as computed by the API.
 */
export function PriorityCard({ reportId }: { reportId: string }) {
  const f = useFormat();
  const query = useQuery({
    queryKey: queryKeys.reportPriority(reportId),
    queryFn: ({ signal }) => api.get(`/admin/reports/${reportId}/priority`, undefined, { signal }),
    select: (d) => d.priority,
  });

  return (
    <Card>
      <h2 className="mb-2 font-semibold text-slate-900">Why this priority</h2>
      {query.isPending ? (
        <Spinner label="Loading priority…" />
      ) : query.isError ? (
        <LoadError>{errorMessage(query.error, 'Failed to load the priority.')}</LoadError>
      ) : query.data === null ? (
        <p className="text-sm text-slate-500">
          Closed reports are not ranked, so this one has no priority.
        </p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Priority score breakdown</caption>
          <tbody className="divide-y divide-slate-100">
            {rows(query.data, f).map(([label, points]) => (
              <tr key={label}>
                <th scope="row" className="py-1.5 text-left font-normal text-slate-600">
                  {label}
                </th>
                <td className="py-1.5 text-right tabular-nums text-slate-900">
                  {formatPoints(points)}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="pt-2 text-left font-semibold text-slate-900">
                Priority
              </th>
              <td
                className="pt-2 text-right font-semibold tabular-nums text-slate-900"
                data-testid="priority-total"
              >
                {query.data.total}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </Card>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useFormat } from '@/lib/i18n/use-format';
import { queryKeys } from '@/lib/query-keys';
import type { Report, ReportStatus } from '@/lib/types';
import { StatusBadge } from '../badges';
import { Button, Card, Input, Label, LoadError, Spinner } from '../ui';

/** A report can be merged only before it is verified (§26: SUBMITTED or UNDER_REVIEW). */
const MERGEABLE: ReadonlySet<ReportStatus> = new Set<ReportStatus>(['SUBMITTED', 'UNDER_REVIEW']);

interface Target {
  id: string;
  /** Unknown when an admin types an id. */
  title?: string;
}

/**
 * Merging a duplicate into its original (F4): likely originals first, any
 * report by id as a fallback, and a confirmation step, because a merge closes
 * this report for good.
 */
export function DuplicateMerge({
  report,
  busy,
  onMerge,
}: {
  report: Report;
  busy: boolean;
  onMerge: (originalId: string) => void;
}) {
  const f = useFormat();
  const mergeable = MERGEABLE.has(report.status);
  const [target, setTarget] = useState<Target | null>(null);
  const [typedId, setTypedId] = useState('');

  const query = useQuery({
    queryKey: queryKeys.duplicateCandidates(report.id),
    queryFn: ({ signal }) =>
      api.get(`/admin/reports/${report.id}/duplicate-candidates`, undefined, { signal }),
    enabled: mergeable,
  });

  if (report.status === 'DUPLICATE' && report.duplicateOfReportId) {
    return (
      <Card>
        <h2 className="mb-2 font-semibold text-slate-900">Merged</h2>
        <p className="text-sm text-slate-600">
          This report was merged into{' '}
          <Link
            href={`/admin/reports/${report.duplicateOfReportId}`}
            className="font-medium text-teal-700 hover:underline"
          >
            its original
          </Link>
          , which its reporter and followers now follow.
        </p>
      </Card>
    );
  }
  if (!mergeable) return null;

  return (
    <Card>
      <h2 className="mb-1 font-semibold text-slate-900">Merge a duplicate</h2>
      {target ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700">
            Merge this report into {target.title ? `"${target.title}"` : `report ${target.id}`}? It
            closes as a duplicate, and its reporter and followers will follow the original.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy} onClick={() => onMerge(target.id)}>
              {busy ? 'Merging…' : 'Confirm merge'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setTarget(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {query.isPending ? (
            <Spinner label="Looking for likely duplicates…" />
          ) : query.isError ? (
            <LoadError>{errorMessage(query.error, 'Failed to look for duplicates.')}</LoadError>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-600">
                Open reports of the same kind within {query.data.radiusM} m, made before this one.
              </p>
              {query.data.candidates.length === 0 ? (
                <p className="text-sm text-slate-500">None found.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {query.data.candidates.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1.5 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={c.status} />
                        <Link
                          href={`/admin/reports/${c.id}`}
                          className="text-sm font-medium text-teal-700 hover:underline"
                        >
                          {c.title}
                        </Link>
                      </div>
                      <p className="text-xs text-slate-500">
                        {c.distanceM ?? 0} m away, reported {f.date(c.createdAt)}
                      </p>
                      <Button
                        variant="secondary"
                        className="self-start"
                        disabled={busy}
                        onClick={() => setTarget({ id: c.id, title: c.title })}
                        aria-label={`Merge into "${c.title}"`}
                      >
                        Merge into this
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <Label htmlFor="dup">Or merge into another report by its ID</Label>
            <Input
              id="dup"
              placeholder="Original report ID"
              value={typedId}
              onChange={(e) => setTypedId(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={busy || !typedId.trim()}
              onClick={() => setTarget({ id: typedId.trim() })}
            >
              Merge
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

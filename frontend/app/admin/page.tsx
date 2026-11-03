'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ReportStatus, Severity } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { Card, LoadError, PageHeader, Spinner, StatTile } from '@/components/ui';

interface Summary {
  totalReports: number;
  byStatus: Record<ReportStatus, number>;
  bySeverity: Record<Severity, number>;
  resolvedCount: number;
  resolutionRate: number;
  avgResolutionHours: number | null;
  unresolvedHighPriority: number;
}

function Dashboard() {
  // Same key as the analytics page: both read one cached summary.
  const summaryQuery = useQuery({
    queryKey: queryKeys.analytics('summary'),
    queryFn: ({ signal }) => api.get<Summary>('/admin/analytics/summary', undefined, { signal }),
  });
  const summary = summaryQuery.data;

  const tiles = summary
    ? [
        { label: 'Total reports', value: summary.totalReports },
        { label: 'Resolved', value: summary.resolvedCount },
        { label: 'Resolution rate', value: `${Math.round(summary.resolutionRate * 100)}%` },
        { label: 'Open high-priority', value: summary.unresolvedHighPriority },
        {
          label: 'Awaiting review',
          value: summary.byStatus.SUBMITTED + summary.byStatus.UNDER_REVIEW,
        },
        { label: 'Avg resolution (h)', value: summary.avgResolutionHours ?? '-' },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Dashboard"
        actions={
          <>
            <Link href="/admin/reports" className="font-medium text-teal-700 hover:underline">
              Reports
            </Link>
            <Link href="/admin/analytics" className="font-medium text-teal-700 hover:underline">
              Analytics
            </Link>
            <Link href="/admin/manage" className="font-medium text-teal-700 hover:underline">
              Manage
            </Link>
          </>
        }
      />

      {summaryQuery.isPending ? (
        <Spinner />
      ) : summaryQuery.isError ? (
        <LoadError>{errorMessage(summaryQuery.error, 'Failed to load the dashboard.')}</LoadError>
      ) : (
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <StatTile key={t.label} label={t.label} value={t.value} />
          ))}
        </div>
      )}

      <Card>
        <h2 className="mb-2 font-semibold text-slate-900">Quick links</h2>
        <ul className="flex flex-col gap-1 text-sm text-teal-700">
          <li>
            <Link href="/admin/reports?status=SUBMITTED" className="hover:underline">
              Reports awaiting review →
            </Link>
          </li>
          <li>
            <Link href="/admin/reports" className="hover:underline">
              Moderate all reports →
            </Link>
          </li>
          <li>
            <Link href="/admin/analytics" className="hover:underline">
              View analytics →
            </Link>
          </li>
          <li>
            <Link href="/admin/manage" className="hover:underline">
              Manage users, categories, departments →
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth require="admin">
      <Dashboard />
    </RequireAuth>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ReportStatus, Severity } from '@/lib/types';
import { severityLabel, statusLabel } from '@/lib/format';
import { RequireAuth } from '@/components/require-auth';
import { BarChart } from '@/components/bar-chart';
import { Card, LoadError, PageHeader, Spinner, StatTile } from '@/components/ui';

function Analytics() {
  const summaryQuery = useQuery({
    queryKey: queryKeys.analytics('summary'),
    queryFn: ({ signal }) => api.get('/admin/analytics/summary', undefined, { signal }),
  });
  const categoriesQuery = useQuery({
    queryKey: queryKeys.analytics('categories'),
    queryFn: ({ signal }) =>
      api.get('/admin/analytics/categories', undefined, {
        signal,
      }),
  });
  const departmentsQuery = useQuery({
    queryKey: queryKeys.analytics('departments'),
    queryFn: ({ signal }) =>
      api.get('/admin/analytics/departments', undefined, {
        signal,
      }),
  });
  const queries = [summaryQuery, categoriesQuery, departmentsQuery];

  if (queries.some((q) => q.isPending)) return <Spinner />;
  const failed = queries.find((q) => q.isError);
  if (failed || !summaryQuery.data) {
    return <LoadError>{errorMessage(failed?.error, 'Failed to load analytics.')}</LoadError>;
  }
  const summary = summaryQuery.data;
  const categories = categoriesQuery.data?.categories ?? [];
  const departments = departmentsQuery.data?.departments ?? [];

  const tiles = [
    { label: 'Total reports', value: summary.totalReports },
    { label: 'Resolved', value: summary.resolvedCount },
    { label: 'Resolution rate', value: `${Math.round(summary.resolutionRate * 100)}%` },
    { label: 'Avg resolution (h)', value: summary.avgResolutionHours ?? '-' },
    { label: 'Open high-priority', value: summary.unresolvedHighPriority },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Analytics"
        subtitle="Reporting trends across the platform."
      />

      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Reports by status</h2>
          <BarChart
            data={Object.entries(summary.byStatus)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => ({ label: statusLabel(k as ReportStatus), value: v }))}
          />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Reports by severity</h2>
          <BarChart
            color="bg-slate-700"
            data={Object.entries(summary.bySeverity).map(([k, v]) => ({
              label: severityLabel(k as Severity),
              value: v,
            }))}
          />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Reports by category</h2>
          <BarChart
            color="bg-teal-400"
            data={categories.map((c) => ({ label: c.name, value: c.total }))}
          />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Department workload (open)</h2>
          <BarChart
            color="bg-slate-900"
            data={departments.map((d) => ({ label: d.name, value: d.openAssignments }))}
          />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">Monthly trend (last 12 months)</h2>
          <BarChart
            color="bg-teal-600"
            data={summary.monthlyTrends.map((m) => ({ label: m.month, value: m.count }))}
          />
        </Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <RequireAuth require="admin">
      <Analytics />
    </RequireAuth>
  );
}

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import {
  asSeverity,
  asStatus,
  SEVERITY_OPTIONS,
  STATUS_OPTIONS,
  severityLabel,
  statusLabel,
} from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { RequireAuth } from '@/components/require-auth';
import { ReportCard } from '@/components/report-card';
import { Button, Card, LoadError, PageHeader, Select, Spinner } from '@/components/ui';

const ADMIN_SORTS = [
  { value: 'priority', label: 'Highest priority' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
] as const;

/** The selected sort, or priority for anything unknown. */
function asAdminSort(value: string) {
  return ADMIN_SORTS.find((s) => s.value === value)?.value ?? 'priority';
}

function AdminReportsList() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({
    status: searchParams.get('status') ?? '',
    categoryId: '',
    severity: '',
    // Triage queue: the most urgent open reports first.
    sort: 'priority',
    page: 1,
  });

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => api.get('/categories', undefined, { signal }),
    select: (d) => d.categories,
  });

  const params = {
    status: asStatus(filters.status),
    categoryId: filters.categoryId || undefined,
    severity: asSeverity(filters.severity),
    sort: asAdminSort(filters.sort),
    page: filters.page,
    limit: 10,
  };
  const reports = useQuery({
    queryKey: queryKeys.adminReports(params),
    queryFn: ({ signal }) => api.get('/admin/reports', params, { signal }),
    placeholderData: keepPreviousData,
  });
  const data = reports.data;

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Moderate reports"
        subtitle="Review, verify, and route incoming issues."
      />

      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <Select
          value={filters.categoryId}
          onChange={(e) => setFilter('categoryId', e.target.value)}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.severity}
          onChange={(e) => setFilter('severity', e.target.value)}
          aria-label="Severity"
        >
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {severityLabel(s)}
            </option>
          ))}
        </Select>
        <Select
          value={filters.sort}
          onChange={(e) => setFilter('sort', e.target.value)}
          aria-label="Sort"
        >
          {ADMIN_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Card>

      {reports.isPending ? (
        <Spinner />
      ) : reports.isError ? (
        <LoadError>{errorMessage(reports.error, 'Failed to load reports.')}</LoadError>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((r) => (
              <ReportCard key={r.id} report={r} hrefBase="/admin/reports" showPriority />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-slate-500">
              Page {data.page} of {Math.max(data.totalPages, 1)} · {data.total} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={data.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={data.page >= data.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">No reports match.</p>
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <RequireAuth require="admin">
      <Suspense fallback={<Spinner />}>
        <AdminReportsList />
      </Suspense>
    </RequireAuth>
  );
}

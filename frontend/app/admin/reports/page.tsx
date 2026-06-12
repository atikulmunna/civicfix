'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Category, Paginated, Report } from '@/lib/types';
import { SEVERITY_OPTIONS, STATUS_OPTIONS, severityLabel, statusLabel } from '@/lib/format';
import { RequireAuth } from '@/components/require-auth';
import { ReportCard } from '@/components/report-card';
import { Button, Card, Select, Spinner } from '@/components/ui';

function AdminReportsList() {
  const params = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState({
    status: params.get('status') ?? '',
    categoryId: '',
    severity: '',
    page: 1,
  });
  const [data, setData] = useState<Paginated<Report> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ categories: Category[] }>('/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get<Paginated<Report>>('/admin/reports', {
      status: filters.status || undefined,
      categoryId: filters.categoryId || undefined,
      severity: filters.severity || undefined,
      page: filters.page,
      limit: 10,
    })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [filters]);

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Moderate reports</h1>

      <Card className="grid gap-3 sm:grid-cols-3">
        <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </Select>
        <Select value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)} aria-label="Severity">
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}
        </Select>
      </Card>

      {loading && !data ? (
        <Spinner />
      ) : data && data.items.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((r) => <ReportCard key={r.id} report={r} hrefBase="/admin/reports" />)}
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-slate-500">Page {data.page} of {Math.max(data.totalPages, 1)} · {data.total} total</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={data.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</Button>
              <Button variant="secondary" disabled={data.page >= data.totalPages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</Button>
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

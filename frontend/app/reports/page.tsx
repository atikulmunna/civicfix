'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Category, Paginated, Report } from '@/lib/types';
import { SEVERITY_OPTIONS, STATUS_OPTIONS, severityLabel, statusLabel } from '@/lib/format';
import { ReportCard } from '@/components/report-card';
import { Button, Card, Input, Select, Spinner } from '@/components/ui';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'priority', label: 'Highest priority' },
  { value: 'most_confirmed', label: 'Most confirmed' },
];

export default function ReportsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState({
    categoryId: '',
    status: '',
    severity: '',
    sort: 'newest',
    page: 1,
  });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<Paginated<Report> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ categories: Category[] }>('/categories')
      .then((d) => setCategories(d.categories))
      .catch(() => setCategories([]));
  }, []);

  // Debounce the search box into the applied `search` value.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setSearch(searchInput);
      setFilters((f) => ({ ...f, page: 1 }));
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [searchInput]);

  const query = useMemo(
    () => ({
      categoryId: filters.categoryId || undefined,
      status: filters.status || undefined,
      severity: filters.severity || undefined,
      search: search || undefined,
      sort: filters.sort,
      page: filters.page,
      limit: 10,
    }),
    [filters, search],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<Paginated<Report>>('/reports', query)
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.message : 'Failed to load reports.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [query]);

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Browse and track issues reported across the city.</p>
      </div>

      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Search title or description…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search"
        />
        <Select value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </Select>
        <Select value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)} aria-label="Severity">
          <option value="">All severities</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>{severityLabel(s)}</option>
          ))}
        </Select>
        <Select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </Card>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-700">{error}</p>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((r) => (
              <ReportCard key={r.id} report={r} />
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
        <p className="py-10 text-center text-sm text-slate-500">No reports match your filters.</p>
      )}
    </div>
  );
}

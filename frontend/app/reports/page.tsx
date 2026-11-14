'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { asSeverity, asStatus, SEVERITY_OPTIONS, STATUS_OPTIONS } from '@/lib/format';
import { useFormat } from '@/lib/i18n/use-format';
import { queryKeys } from '@/lib/query-keys';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { ReportCard } from '@/components/report-card';
import { Button, Card, Input, LoadError, PageHeader, Select, Spinner } from '@/components/ui';

const SORTS = ['newest', 'oldest', 'priority', 'most_confirmed'] as const;

/** The selected sort, or the default for anything unknown. */
function asSort(value: string) {
  return SORTS.find((s) => s === value) ?? 'newest';
}

export default function ReportsPage() {
  const t = useTranslations('reports');
  const paging = useTranslations('common');
  const f = useFormat();
  const [filters, setFilters] = useState({
    categoryId: '',
    status: '',
    severity: '',
    sort: 'newest',
    page: 1,
  });
  const [searchInput, setSearchInput] = useState('');
  // Debounce the search box into the applied search term.
  const search = useDebouncedValue(searchInput, 350);

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => api.get('/categories', undefined, { signal }),
    select: (d) => d.categories,
  });

  const params = {
    categoryId: filters.categoryId || undefined,
    status: asStatus(filters.status),
    severity: asSeverity(filters.severity),
    search: search || undefined,
    sort: asSort(filters.sort),
    page: filters.page,
    limit: 10,
  };
  const reports = useQuery({
    queryKey: queryKeys.reports(params),
    queryFn: ({ signal }) => api.get('/reports', params, { signal }),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
  const data = reports.data;

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />

      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder={t('searchPlaceholder')}
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setFilters((f) => ({ ...f, page: 1 }));
          }}
          aria-label={t('search')}
        />
        <Select
          value={filters.categoryId}
          onChange={(e) => setFilter('categoryId', e.target.value)}
          aria-label={t('category')}
        >
          <option value="">{t('allCategories')}</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label={t('status')}
        >
          <option value="">{t('allStatuses')}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {f.status(s)}
            </option>
          ))}
        </Select>
        <Select
          value={filters.severity}
          onChange={(e) => setFilter('severity', e.target.value)}
          aria-label={t('severity')}
        >
          <option value="">{t('allSeverities')}</option>
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {f.severity(s)}
            </option>
          ))}
        </Select>
        <Select
          value={filters.sort}
          onChange={(e) => setFilter('sort', e.target.value)}
          aria-label={t('sort')}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sorts.${s}`)}
            </option>
          ))}
        </Select>
      </Card>

      {reports.isPending ? (
        <Spinner />
      ) : reports.isError ? (
        <LoadError>{errorMessage(reports.error, t('loadError'))}</LoadError>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-slate-500">
              {paging('pageOf', {
                page: data.page,
                pages: Math.max(data.totalPages, 1),
                total: data.total,
              })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={data.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              >
                {paging('previous')}
              </Button>
              <Button
                variant="secondary"
                disabled={data.page >= data.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                {paging('next')}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">{t('none')}</p>
      )}
    </div>
  );
}

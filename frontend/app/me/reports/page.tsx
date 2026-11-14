'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { RequireAuth } from '@/components/require-auth';
import { ReportCard } from '@/components/report-card';
import { Button, LoadError, PageHeader, Spinner } from '@/components/ui';

function MyReports() {
  const t = useTranslations('me');
  const paging = useTranslations('common');
  const [page, setPage] = useState(1);
  const reports = useQuery({
    queryKey: queryKeys.myReports(page),
    queryFn: ({ signal }) => api.get('/users/me/reports', { page, limit: 10 }, { signal }),
    placeholderData: keepPreviousData,
  });
  const data = reports.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('reports.title')}
        actions={
          <Link
            href="/reports/new"
            className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white transition hover:bg-teal-700"
          >
            {t('reports.reportIssue')}
          </Link>
        }
      />

      {reports.isPending ? (
        <Spinner />
      ) : reports.isError ? (
        <LoadError>{errorMessage(reports.error, t('reports.loadError'))}</LoadError>
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
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {paging('previous')}
              </Button>
              <Button
                variant="secondary"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {paging('next')}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">
          {t.rich('reports.empty', {
            link: (chunks) => (
              <Link href="/reports/new" className="font-medium text-teal-700 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  );
}

export default function MyReportsPage() {
  return (
    <RequireAuth>
      <MyReports />
    </RequireAuth>
  );
}

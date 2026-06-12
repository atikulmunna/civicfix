'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Paginated, Report } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { ReportCard } from '@/components/report-card';
import { Button, Spinner } from '@/components/ui';

function MyReports() {
  const [data, setData] = useState<Paginated<Report> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<Paginated<Report>>('/users/me/reports', { page, limit: 10 })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">My reports</h1>
        <Link href="/reports/new" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
          Report an issue
        </Link>
      </div>

      {loading && !data ? (
        <Spinner />
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
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">
          You haven’t reported anything yet.{' '}
          <Link href="/reports/new" className="font-medium text-teal-700 hover:underline">Report an issue</Link>.
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

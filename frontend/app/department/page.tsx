'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Paginated, Report } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { RequireAuth } from '@/components/require-auth';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { useToast } from '@/components/toast';
import { Button, Spinner } from '@/components/ui';

function Queue() {
  const { toast } = useToast();
  const [data, setData] = useState<Paginated<Report> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    return api.get<Paginated<Report>>('/department/reports', { limit: 50 }).then(setData).catch(() => setData(null));
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      await load();
      toast(ok, 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Action failed.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">My department queue</h1>
      {data && data.items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  <SeverityBadge severity={r.severity} />
                  <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
                </div>
                <Link href={`/reports/${r.id}`} className="mt-1 block truncate font-medium text-slate-900 hover:underline">
                  {r.title}
                </Link>
              </div>
              <div className="flex gap-2">
                {r.status === 'ASSIGNED' && (
                  <Button
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, () => api.patch(`/admin/reports/${r.id}/status`, { status: 'IN_PROGRESS' }), 'Work started.')}
                  >
                    Start work
                  </Button>
                )}
                {r.status === 'IN_PROGRESS' && (
                  <Button
                    disabled={busyId === r.id}
                    onClick={() => act(r.id, () => api.post(`/admin/reports/${r.id}/resolve`, {}), 'Marked resolved.')}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">No reports assigned to your department.</p>
      )}
    </div>
  );
}

export default function DepartmentPage() {
  return (
    <RequireAuth require="staff">
      <Queue />
    </RequireAuth>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ReportStatus, Severity } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { Card, Spinner } from '@/components/ui';

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
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Summary>('/admin/analytics/summary').then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
  }, []);

  const tiles = summary
    ? [
        { label: 'Total reports', value: summary.totalReports },
        { label: 'Resolved', value: summary.resolvedCount },
        { label: 'Resolution rate', value: `${Math.round(summary.resolutionRate * 100)}%` },
        { label: 'Open high-priority', value: summary.unresolvedHighPriority },
        { label: 'Awaiting review', value: summary.byStatus.SUBMITTED + summary.byStatus.UNDER_REVIEW },
        { label: 'Avg resolution (h)', value: summary.avgResolutionHours ?? '—' },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Admin dashboard</h1>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/reports" className="font-medium text-teal-700 hover:underline">Reports</Link>
          <Link href="/admin/analytics" className="font-medium text-teal-700 hover:underline">Analytics</Link>
          <Link href="/admin/manage" className="font-medium text-teal-700 hover:underline">Manage</Link>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Card key={t.label}>
              <p className="text-sm text-slate-500">{t.label}</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{t.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <h2 className="mb-2 font-semibold text-slate-900">Quick links</h2>
        <ul className="flex flex-col gap-1 text-sm text-teal-700">
          <li><Link href="/admin/reports?status=SUBMITTED" className="hover:underline">Reports awaiting review →</Link></li>
          <li><Link href="/admin/reports" className="hover:underline">Moderate all reports →</Link></li>
          <li><Link href="/admin/analytics" className="hover:underline">View analytics →</Link></li>
          <li><Link href="/admin/manage" className="hover:underline">Manage users, categories, departments →</Link></li>
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

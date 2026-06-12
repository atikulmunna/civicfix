'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ReportStatus, Severity } from '@/lib/types';
import { severityLabel, statusLabel } from '@/lib/format';
import { RequireAuth } from '@/components/require-auth';
import { BarChart } from '@/components/bar-chart';
import { Card, Spinner } from '@/components/ui';

interface Summary {
  totalReports: number;
  byStatus: Record<ReportStatus, number>;
  bySeverity: Record<Severity, number>;
  resolvedCount: number;
  resolutionRate: number;
  avgResolutionHours: number | null;
  unresolvedHighPriority: number;
  monthlyTrends: { month: string; count: number }[];
}
interface CategoryRow { categoryId: string; name: string; total: number; resolved: number }
interface DeptRow { departmentId: string; name: string; total: number; openAssignments: number; resolved: number; avgResolutionHours: number | null }

function Analytics() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Summary>('/admin/analytics/summary').then(setSummary),
      api.get<{ categories: CategoryRow[] }>('/admin/analytics/categories').then((d) => setCategories(d.categories)),
      api.get<{ departments: DeptRow[] }>('/admin/analytics/departments').then((d) => setDepartments(d.departments)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!summary) return <p className="py-10 text-center text-sm text-red-700">Failed to load analytics.</p>;

  const tiles = [
    { label: 'Total reports', value: summary.totalReports },
    { label: 'Resolved', value: summary.resolvedCount },
    { label: 'Resolution rate', value: `${Math.round(summary.resolutionRate * 100)}%` },
    { label: 'Avg resolution (h)', value: summary.avgResolutionHours ?? '—' },
    { label: 'Open high-priority', value: summary.unresolvedHighPriority },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Card key={t.label}>
            <p className="text-sm text-slate-500">{t.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{t.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Reports by status</h2>
          <BarChart data={Object.entries(summary.byStatus).filter(([, v]) => v > 0).map(([k, v]) => ({ label: statusLabel(k as ReportStatus), value: v }))} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Reports by severity</h2>
          <BarChart color="bg-slate-700" data={Object.entries(summary.bySeverity).map(([k, v]) => ({ label: severityLabel(k as Severity), value: v }))} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Reports by category</h2>
          <BarChart color="bg-teal-400" data={categories.map((c) => ({ label: c.name, value: c.total }))} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Department workload (open)</h2>
          <BarChart color="bg-slate-900" data={departments.map((d) => ({ label: d.name, value: d.openAssignments }))} />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">Monthly trend (last 12 months)</h2>
          <BarChart color="bg-teal-600" data={summary.monthlyTrends.map((m) => ({ label: m.month, value: m.count }))} />
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

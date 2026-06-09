/**
 * Analytics (SRS v1.1 §6.14, §9.7, AN-001..009). Read-only aggregations for
 * the admin dashboard. Count rollups use Prisma groupBy; time-based metrics
 * (avg resolution time, monthly trends) use parameter-free raw SQL.
 */
import type { ReportStatus, Severity } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

const ALL_STATUSES: ReportStatus[] = [
  'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS',
  'RESOLVED', 'REJECTED', 'DUPLICATE', 'NEEDS_MORE_INFO', 'ARCHIVED',
];
const ALL_SEVERITIES: Severity[] = ['low', 'medium', 'high', 'urgent'];
const TERMINAL: ReportStatus[] = ['RESOLVED', 'REJECTED', 'DUPLICATE', 'ARCHIVED'];

function secondsToHours(seconds: number | null): number | null {
  return seconds === null ? null : Math.round((seconds / 3600) * 100) / 100;
}

interface AvgRow {
  seconds: number | null;
}
interface MonthRow {
  month: string;
  count: number;
}

export async function getSummary() {
  const [total, statusRows, severityRows, resolvedCount, highPriorityOpen] =
    await Promise.all([
      prisma.report.count(),
      prisma.report.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.report.groupBy({ by: ['severity'], _count: { _all: true } }),
      prisma.report.count({ where: { status: 'RESOLVED' } }),
      prisma.report.count({
        where: { severity: { in: ['high', 'urgent'] }, status: { notIn: TERMINAL } },
      }),
    ]);

  const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ReportStatus, number>;
  for (const r of statusRows) byStatus[r.status] = r._count._all;

  const bySeverity = Object.fromEntries(ALL_SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const r of severityRows) bySeverity[r.severity] = r._count._all;

  const [{ seconds }] = await prisma.$queryRaw<AvgRow[]>`
    SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))::float8 AS seconds
    FROM reports
    WHERE resolved_at IS NOT NULL
  `;

  const monthlyTrends = await prisma.$queryRaw<MonthRow[]>`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
           COUNT(*)::int AS count
    FROM reports
    WHERE created_at >= (now() - interval '12 months')
    GROUP BY 1
    ORDER BY 1
  `;

  return {
    totalReports: total,
    byStatus,
    bySeverity,
    resolvedCount,
    resolutionRate: total > 0 ? Math.round((resolvedCount / total) * 10000) / 10000 : 0,
    avgResolutionHours: secondsToHours(seconds),
    unresolvedHighPriority: highPriorityOpen,
    monthlyTrends,
  };
}

export async function getCategoryAnalytics() {
  const [categories, totals, resolved] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.report.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    prisma.report.groupBy({
      by: ['categoryId'],
      where: { status: 'RESOLVED' },
      _count: { _all: true },
    }),
  ]);

  const totalMap = new Map(totals.map((t) => [t.categoryId, t._count._all]));
  const resolvedMap = new Map(resolved.map((t) => [t.categoryId, t._count._all]));

  return categories.map((c) => ({
    categoryId: c.id,
    name: c.name,
    total: totalMap.get(c.id) ?? 0,
    resolved: resolvedMap.get(c.id) ?? 0,
  }));
}

interface DeptAvgRow {
  departmentId: string;
  seconds: number | null;
}

export async function getDepartmentAnalytics() {
  const [departments, totals, open, resolved] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: 'asc' } }),
    prisma.report.groupBy({
      by: ['assignedDepartmentId'],
      where: { assignedDepartmentId: { not: null } },
      _count: { _all: true },
    }),
    prisma.report.groupBy({
      by: ['assignedDepartmentId'],
      where: { assignedDepartmentId: { not: null }, status: { notIn: TERMINAL } },
      _count: { _all: true },
    }),
    prisma.report.groupBy({
      by: ['assignedDepartmentId'],
      where: { assignedDepartmentId: { not: null }, status: 'RESOLVED' },
      _count: { _all: true },
    }),
  ]);

  const avgRows = await prisma.$queryRaw<DeptAvgRow[]>`
    SELECT assigned_department_id AS "departmentId",
           AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))::float8 AS seconds
    FROM reports
    WHERE resolved_at IS NOT NULL AND assigned_department_id IS NOT NULL
    GROUP BY 1
  `;

  const totalMap = new Map(totals.map((t) => [t.assignedDepartmentId, t._count._all]));
  const openMap = new Map(open.map((t) => [t.assignedDepartmentId, t._count._all]));
  const resolvedMap = new Map(resolved.map((t) => [t.assignedDepartmentId, t._count._all]));
  const avgMap = new Map(avgRows.map((r) => [r.departmentId, r.seconds]));

  return departments.map((d) => ({
    departmentId: d.id,
    name: d.name,
    total: totalMap.get(d.id) ?? 0,
    openAssignments: openMap.get(d.id) ?? 0,
    resolved: resolvedMap.get(d.id) ?? 0,
    avgResolutionHours: secondsToHours(avgMap.get(d.id) ?? null),
  }));
}

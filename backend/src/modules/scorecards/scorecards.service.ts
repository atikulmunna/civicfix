/**
 * Loads the facts behind the public department scorecards (F2) and builds
 * one scorecard per active department (see ./scorecard.ts for the rules).
 */
import { prisma } from '../../lib/prisma.js';
import { scorecard, TARGET_HOURS, WINDOW_DAYS, type AssignmentFacts } from './scorecard.js';

export async function getScorecards(now = new Date()) {
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const assignments = await prisma.reportAssignment.findMany({
    where: { isCurrent: true, departmentId: { in: departments.map((d) => d.id) } },
    select: {
      departmentId: true,
      createdAt: true,
      report: {
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          resolvedAt: true,
          statusHistory: {
            select: { newStatus: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });

  const byDepartment = new Map<string, AssignmentFacts[]>();
  for (const { departmentId, createdAt: assignedAt, report } of assignments) {
    // The assignment and its ASSIGNED history row share one transaction (and
    // so one timestamp); the department's first response is the next change.
    const firstResponse = report.statusHistory.find(
      (h) => h.createdAt.getTime() >= assignedAt.getTime() && h.newStatus !== 'ASSIGNED',
    );
    // Resolved now, after this assignment; a reopened report is open again.
    const resolvedNow =
      (report.status === 'RESOLVED' || report.status === 'ARCHIVED') &&
      report.resolvedAt !== null &&
      report.resolvedAt.getTime() >= assignedAt.getTime();
    const facts: AssignmentFacts = {
      reportId: report.id,
      title: report.title,
      severity: report.severity,
      status: report.status,
      assignedAt,
      firstResponseAt: firstResponse?.createdAt ?? null,
      resolvedAt: resolvedNow ? report.resolvedAt : null,
    };
    byDepartment.set(departmentId, [...(byDepartment.get(departmentId) ?? []), facts]);
  }

  return {
    generatedAt: now,
    windowDays: WINDOW_DAYS,
    targets: TARGET_HOURS,
    departments: departments.map((d) => scorecard(d, byDepartment.get(d.id) ?? [], now)),
  };
}

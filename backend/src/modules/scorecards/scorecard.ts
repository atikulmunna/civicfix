/**
 * Public department scorecards (F2): how quickly each department responds to
 * and resolves the reports assigned to it, against targets per severity.
 *
 * Agreed 2026-11-03: the "balanced" targets below, and a department's clock
 * starts when a report is assigned to it (so time spent awaiting admin review
 * does not count against the department).
 *
 * Pure functions over plain facts (see scorecards.service.ts for loading).
 */
import type { ReportStatus, Severity } from '../../generated/prisma/client.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Targets in hours, by severity. */
export const TARGET_HOURS = {
  /** First response: the department's first status change after assignment. */
  response: { urgent: 24, high: 48, medium: 120, low: 240 },
  /** Resolution: the report is resolved. */
  resolution: { urgent: 72, high: 168, medium: 336, low: 720 },
} as const satisfies Record<'response' | 'resolution', Record<Severity, number>>;

/** Rates and medians cover assignments made in the last 90 days. */
export const WINDOW_DAYS = 90;
/** Overdue reports listed per department, most overdue first. */
export const OVERDUE_LIMIT = 50;

/** Closed without a fix: nothing to resolve, so left out of resolution measures. */
const CLOSED_UNRESOLVED: ReadonlySet<ReportStatus> = new Set<ReportStatus>([
  'REJECTED',
  'DUPLICATE',
]);
const CLOSED: ReadonlySet<ReportStatus> = new Set<ReportStatus>([
  'RESOLVED',
  'REJECTED',
  'DUPLICATE',
  'ARCHIVED',
]);

/** One report as currently assigned to a department. */
export interface AssignmentFacts {
  reportId: string;
  title: string;
  severity: Severity;
  status: ReportStatus;
  assignedAt: Date;
  /** The department's first status change after assignment, if any. */
  firstResponseAt: Date | null;
  /** When it was resolved, if it is resolved now (reopened reports are not). */
  resolvedAt: Date | null;
}

export interface OverdueReport {
  reportId: string;
  title: string;
  severity: Severity;
  status: ReportStatus;
  assignedAt: Date;
  dueAt: Date;
  hoursOverdue: number;
}

export interface DepartmentScorecard {
  departmentId: string;
  name: string;
  /** Assigned in the window. */
  assigned: number;
  resolved: number;
  /** resolved / resolvable (closed-without-fix excluded); null with none. */
  resolutionRate: number | null;
  medianResponseHours: number | null;
  medianResolveHours: number | null;
  /** Of reports whose response is in or overdue, the share on time. */
  respondedOnTimeRate: number | null;
  /** Of reports whose resolution is in or overdue, the share on time. */
  resolvedOnTimeRate: number | null;
  /** How many open reports are past their resolution target, at any age. */
  overdueCount: number;
  /** The most overdue of them, at most OVERDUE_LIMIT. */
  overdue: OverdueReport[];
}

const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / HOUR_MS;
const round1 = (n: number) => Math.round(n * 10) / 10;
const ratio = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 10_000) / 10_000;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return value === undefined ? null : round1(value);
}

/**
 * On-time share for one target: counted over reports whose outcome is known,
 * i.e. the event happened or its deadline has passed without it.
 */
function onTimeRate(
  facts: readonly AssignmentFacts[],
  at: (f: AssignmentFacts) => Date | null,
  targets: Record<Severity, number>,
  now: Date,
): number | null {
  let due = 0;
  let onTime = 0;
  for (const f of facts) {
    const target = targets[f.severity];
    const happened = at(f);
    const deadlinePassed = hoursBetween(f.assignedAt, now) > target;
    if (!happened && !deadlinePassed) continue;
    due += 1;
    if (happened && hoursBetween(f.assignedAt, happened) <= target) onTime += 1;
  }
  return ratio(onTime, due);
}

export function scorecard(
  department: { id: string; name: string },
  facts: readonly AssignmentFacts[],
  now: Date,
): DepartmentScorecard {
  const windowStart = now.getTime() - WINDOW_DAYS * DAY_MS;
  const recent = facts.filter((f) => f.assignedAt.getTime() >= windowStart);
  const resolvable = recent.filter((f) => !CLOSED_UNRESOLVED.has(f.status));
  const resolved = resolvable.filter((f) => f.resolvedAt !== null);

  const allOverdue = facts
    .filter((f) => !CLOSED.has(f.status))
    .map((f) => {
      const dueAt = new Date(
        f.assignedAt.getTime() + TARGET_HOURS.resolution[f.severity] * HOUR_MS,
      );
      return { f, dueAt, hoursOverdue: round1(hoursBetween(dueAt, now)) };
    })
    .filter((o) => o.hoursOverdue > 0)
    .sort((a, b) => b.hoursOverdue - a.hoursOverdue);
  const overdue = allOverdue.slice(0, OVERDUE_LIMIT).map(({ f, dueAt, hoursOverdue }) => ({
    reportId: f.reportId,
    title: f.title,
    severity: f.severity,
    status: f.status,
    assignedAt: f.assignedAt,
    dueAt,
    hoursOverdue,
  }));

  return {
    departmentId: department.id,
    name: department.name,
    assigned: recent.length,
    resolved: resolved.length,
    resolutionRate: ratio(resolved.length, resolvable.length),
    medianResponseHours: median(
      recent.flatMap((f) =>
        f.firstResponseAt ? [hoursBetween(f.assignedAt, f.firstResponseAt)] : [],
      ),
    ),
    medianResolveHours: median(
      resolved.flatMap((f) => (f.resolvedAt ? [hoursBetween(f.assignedAt, f.resolvedAt)] : [])),
    ),
    respondedOnTimeRate: onTimeRate(recent, (f) => f.firstResponseAt, TARGET_HOURS.response, now),
    resolvedOnTimeRate: onTimeRate(resolvable, (f) => f.resolvedAt, TARGET_HOURS.resolution, now),
    overdueCount: allOverdue.length,
    overdue,
  };
}

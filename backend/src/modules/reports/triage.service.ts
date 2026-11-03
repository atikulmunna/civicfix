/**
 * Keeps triage data current (F1): each report's stored priority anchor and
 * each reporter's trust score. The formula lives in ./priority.ts; this file
 * gathers its inputs and writes the results.
 *
 * Callers refresh after anything that changes an input: a new report, a
 * confirm or false-report vote, a status change, a severity edit. The deploy
 * release step runs recomputeAll(), so existing data and any change of
 * weights are applied once per deploy.
 */
import type { Prisma } from '../../generated/prisma/client.js';
import {
  priorityAnchor,
  priorityBreakdown,
  trustScore,
  type PriorityBreakdown,
  type PriorityInput,
} from './priority.js';
import { TERMINAL_STATUSES } from './status-machine.js';

/**
 * The client or an open transaction, always passed in: this module does not
 * import the app's client, so the seed script can use it without the app's
 * environment (see lib/prisma-client.ts).
 */
type Db = Prisma.TransactionClient;

/** Statuses that count as a report being upheld (it was real). */
const UPHELD_STATUSES = ['VERIFIED', 'RESOLVED'] as const;

/** Everything the formula needs about one report, or null if it is gone. */
async function loadInput(reportId: string, db: Db): Promise<PriorityInput | null> {
  const report = await db.report.findUnique({
    where: { id: reportId },
    select: {
      status: true,
      severity: true,
      createdAt: true,
      confirmCount: true,
      reporter: { select: { trustScore: true } },
    },
  });
  if (!report) return null;
  const falseReports = await db.vote.count({ where: { reportId, voteType: 'false_report' } });
  return {
    status: report.status,
    severity: report.severity,
    createdAt: report.createdAt,
    confirms: report.confirmCount,
    falseReports,
    reporterTrust: report.reporter.trustScore,
  };
}

/** Recompute and store one report's priority anchor. */
export async function refreshPriority(reportId: string, db: Db): Promise<void> {
  const input = await loadInput(reportId, db);
  if (!input) return;
  // updateMany: a report deleted meanwhile is simply skipped (recomputeAll runs
  // on a live database).
  await db.report.updateMany({
    where: { id: reportId },
    data: { priorityAnchor: priorityAnchor(input) },
  });
}

/**
 * Recompute a reporter's trust from the outcomes of their reports, then the
 * priority of each of their reports (the reporter term may have changed).
 */
export async function refreshReporterTrust(userId: string, db: Db): Promise<number> {
  const [upheld, rejected] = await Promise.all([
    db.report.count({
      where: { userId, statusHistory: { some: { newStatus: { in: [...UPHELD_STATUSES] } } } },
    }),
    db.report.count({ where: { userId, statusHistory: { some: { newStatus: 'REJECTED' } } } }),
  ]);
  const trust = trustScore({ upheld, rejected });
  await db.user.updateMany({ where: { id: userId }, data: { trustScore: trust } });

  const reports = await db.report.findMany({ where: { userId }, select: { id: true } });
  for (const { id } of reports) await refreshPriority(id, db);
  return trust;
}

export interface PriorityExplanation extends PriorityBreakdown {
  inputs: Pick<PriorityInput, 'severity' | 'confirms' | 'falseReports' | 'reporterTrust'>;
}

/**
 * Why a report ranks where it does today, or null when it is closed (not
 * ranked). Throws nothing for a missing report: the caller checks existence.
 */
export async function explainPriority(
  reportId: string,
  db: Db,
  now = new Date(),
): Promise<PriorityExplanation | null> {
  const input = await loadInput(reportId, db);
  if (!input) return null;
  const breakdown = priorityBreakdown(input, now);
  if (!breakdown) return null;
  const { severity, confirms, falseReports, reporterTrust } = input;
  return { ...breakdown, inputs: { severity, confirms, falseReports, reporterTrust } };
}

/**
 * Recompute every reporter's trust and every report's anchor. Run after
 * migrations on deploy (and by the seed), so existing reports get anchors and
 * a change of weights takes effect everywhere.
 */
export async function recomputeAll(db: Db): Promise<{ users: number; reports: number }> {
  await db.report.updateMany({
    where: { status: { in: [...TERMINAL_STATUSES] } },
    data: { priorityAnchor: null },
  });
  const reporters = await db.user.findMany({
    where: { reports: { some: {} } },
    select: { id: true },
  });
  for (const { id } of reporters) await refreshReporterTrust(id, db);
  const reports = await db.report.count();
  return { users: reporters.length, reports };
}

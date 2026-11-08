/**
 * Admin/department report workflow (SRS v1.1 §6.10/6.11/6.12, §13).
 *
 * All status changes flow through `transitionStatus`, which enforces the §26
 * state machine (assertTransition), BR-005 department scoping, the required
 * side effects (internal note / duplicate target / assignment / resolvedAt),
 * and always writes a status_history row (BR-009/STAT-002).
 */
import type { Prisma, Report } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { assertReportExists } from '../community/shared.js';
import { getVoteCounts } from '../community/votes.service.js';
import { createStatusChangeNotifications } from '../notifications/notifications.service.js';
import {
  getReportById,
  REPORT_IMAGES,
  toPublicReport,
  type Actor,
} from '../reports/reports.service.js';
import { refreshPriority, refreshReporterTrust } from '../reports/triage.service.js';
import {
  assertTransition,
  InvalidStatusTransitionError,
  type ReportStatus,
  type TransitionEffects,
} from '../reports/status-machine.js';
import type { AdminListInput, DeptListInput } from './workflow.schemas.js';

const isAdmin = (a: Actor): boolean => a.role === 'admin' || a.role === 'super_admin';

export interface TransitionPayload {
  note?: string;
  internalNote?: string;
  duplicateOfReportId?: string;
  departmentId?: string;
}

/** Outcomes that change the reporter's trust score (F1). */
/**
 * Why a report cannot be merged into one that is closed. Into a fixed one
 * least of all: a problem reported again after a fix has come back (F4).
 */
const CLOSED_ORIGINAL: Partial<Record<ReportStatus, string>> = {
  RESOLVED:
    'Merge into an open report: this one is already resolved. ' +
    'A problem reported again after a fix is not a duplicate.',
  REJECTED: 'Merge into an open report: this one was rejected.',
  DUPLICATE: 'Merge into an open report: this one is already a duplicate.',
  ARCHIVED: 'Merge into an open report: this one is archived.',
};

const TRUST_OUTCOMES: ReadonlySet<ReportStatus> = new Set<ReportStatus>([
  'VERIFIED',
  'RESOLVED',
  'REJECTED',
]);

export async function transitionStatus(
  reportId: string,
  actor: Actor,
  toStatus: ReportStatus,
  payload: TransitionPayload,
) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    throw new ApiError('NOT_FOUND', 'Report not found.');
  }

  // BR-005: a department worker may only act on reports assigned to their dept.
  if (!isAdmin(actor)) {
    const me = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { departmentId: true },
    });
    if (!me?.departmentId || report.assignedDepartmentId !== me.departmentId) {
      throw new ApiError('FORBIDDEN', 'You can only act on reports assigned to your department.');
    }
  }

  // §26 legality + required side effects.
  let effects;
  try {
    effects = assertTransition(report.status, toStatus, actor.role);
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) {
      throw new ApiError('INVALID_STATUS_TRANSITION', err.message, err.details);
    }
    throw err;
  }

  // Validate the payload satisfies the effect requirements.
  let merge: { note: string; notice: string } | undefined;
  if (effects.requiresInternalNote && !payload.internalNote?.trim()) {
    throw new ApiError('VALIDATION_ERROR', 'An internal note is required for this action.');
  }
  if (effects.requiresDuplicateTarget) {
    if (!payload.duplicateOfReportId) {
      throw new ApiError('VALIDATION_ERROR', 'A duplicate target report is required.');
    }
    if (payload.duplicateOfReportId === reportId) {
      throw new ApiError('VALIDATION_ERROR', 'A report cannot be a duplicate of itself.');
    }
    const original = await prisma.report.findUnique({
      where: { id: payload.duplicateOfReportId },
      select: { title: true, status: true },
    });
    if (!original) throw new ApiError('NOT_FOUND', 'The original report was not found.');
    const closed = CLOSED_ORIGINAL[original.status];
    if (closed) throw new ApiError('VALIDATION_ERROR', closed);
    merge = {
      note: payload.note?.trim() ? payload.note : `Merged into "${original.title}".`,
      notice:
        `Your report "${report.title}" was merged into "${original.title}", ` +
        'which reports the same problem. You will get its updates from now on.',
    };
  }
  if (effects.createsAssignment) {
    if (!payload.departmentId) {
      throw new ApiError('VALIDATION_ERROR', 'A department is required to assign this report.');
    }
    const dept = await prisma.department.findUnique({ where: { id: payload.departmentId } });
    if (!dept?.isActive) {
      throw new ApiError('VALIDATION_ERROR', 'The selected department does not exist.');
    }
  }

  const toWrite = merge ? { ...payload, note: merge.note } : payload;
  const options = merge ? { notice: merge.notice } : {};
  await prisma.$transaction((tx) =>
    applyTransition(tx, report, toStatus, effects, actor.id, toWrite, options),
  );

  return getReportById(reportId, actor);
}

/**
 * Write a status change that has already been checked (assertTransition, or
 * transitionEffects for a system change) and its validated payload: the
 * report itself, any assignment, the history row every change gets (BR-009),
 * subscriber notifications and triage. Runs inside the caller's transaction.
 */
export async function applyTransition(
  tx: Prisma.TransactionClient,
  report: Pick<Report, 'id' | 'status' | 'title' | 'userId'>,
  toStatus: ReportStatus,
  effects: TransitionEffects,
  actorId: string,
  payload: TransitionPayload,
  /** `notice` replaces the standard message to subscribers. */
  options: { notice?: string } = {},
): Promise<void> {
  const reportId = report.id;
  const data: Prisma.ReportUpdateInput = { status: toStatus };
  if (effects.setsResolvedAt) data.resolvedAt = new Date();
  if (effects.clearsResolvedAt) data.resolvedAt = null;
  if (payload.internalNote !== undefined) data.internalNote = payload.internalNote;
  if (effects.requiresDuplicateTarget && payload.duplicateOfReportId) {
    data.duplicateOf = { connect: { id: payload.duplicateOfReportId } };
  }
  if (effects.createsAssignment && payload.departmentId) {
    data.assignedDepartment = { connect: { id: payload.departmentId } };
  }

  await tx.report.update({ where: { id: reportId }, data });

  if (effects.createsAssignment && payload.departmentId) {
    // Keep one current assignment; supersede prior ones (§8.2.10).
    await tx.reportAssignment.updateMany({
      where: { reportId, isCurrent: true },
      data: { isCurrent: false },
    });
    await tx.reportAssignment.create({
      data: {
        reportId,
        departmentId: payload.departmentId,
        assignedBy: actorId,
        note: payload.note ?? null,
        isCurrent: true,
      },
    });
  }

  await tx.statusHistory.create({
    data: {
      reportId,
      oldStatus: report.status,
      newStatus: toStatus,
      changedBy: actorId,
      note: payload.note ?? null,
    },
  });

  if (effects.requiresDuplicateTarget && payload.duplicateOfReportId) {
    await followOriginal(tx, reportId, payload.duplicateOfReportId);
  }

  // Notify subscribers of the change (§13.5, NOTIF-001/002/003).
  await createStatusChangeNotifications(tx, {
    reportId,
    reportTitle: report.title,
    newStatus: toStatus,
    actorId,
    ...(options.notice && { message: options.notice }),
  });

  // Triage (F1), after the history row it counts: an outcome changes the
  // reporter's trust (and so all their reports); any status change can
  // close or reopen this report's ranking.
  if (TRUST_OUTCOMES.has(toStatus)) await refreshReporterTrust(report.userId, tx);
  else await refreshPriority(reportId, tx);
}

/**
 * Merging (F4): everyone following a duplicate follows its original too, so
 * they hear when the problem is dealt with. They are ordinary follows, which
 * they can stop like any other; the original's own reporter keeps theirs.
 */
async function followOriginal(
  tx: Prisma.TransactionClient,
  duplicateId: string,
  originalId: string,
): Promise<void> {
  const followers = await tx.reportSubscription.findMany({
    where: { reportId: duplicateId },
    select: { userId: true },
  });
  if (followers.length === 0) return;
  await tx.reportSubscription.createMany({
    data: followers.map((f) => ({
      reportId: originalId,
      userId: f.userId,
      source: 'explicit' as const,
    })),
    skipDuplicates: true,
  });
}

export async function listAdminReports(input: AdminListInput) {
  const where: Prisma.ReportWhereInput = {};
  if (input.status) where.status = input.status;
  if (input.categoryId) where.categoryId = input.categoryId;
  if (input.severity) where.severity = input.severity;
  if (input.assignedDepartmentId) where.assignedDepartmentId = input.assignedDepartmentId;
  if (input.dateFrom || input.dateTo) {
    where.createdAt = {};
    if (input.dateFrom) where.createdAt.gte = input.dateFrom;
    if (input.dateTo) where.createdAt.lte = input.dateTo;
  }

  const orderBy: Prisma.ReportOrderByWithRelationInput[] =
    input.sort === 'oldest'
      ? [{ createdAt: 'asc' }]
      : input.sort === 'priority'
        ? [{ priorityAnchor: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }];

  const [total, rows] = await prisma.$transaction([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: { images: REPORT_IMAGES, category: true },
    }),
  ]);

  const counts = await getVoteCounts(rows.map((r) => r.id));
  return {
    items: rows.map((r) => ({ ...toPublicReport(r, true), counts: counts.get(r.id) })),
    page: input.page,
    limit: input.limit,
    total,
    totalPages: Math.ceil(total / input.limit),
  };
}

/** Reports assigned to the actor's department (DEPT-001). */
export async function listDepartmentReports(actor: Actor, input: DeptListInput) {
  const me = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { departmentId: true },
  });
  if (!me?.departmentId) {
    // Admins (or workers without a department) have no department queue.
    return { items: [], page: input.page, limit: input.limit, total: 0, totalPages: 0 };
  }

  const where: Prisma.ReportWhereInput = { assignedDepartmentId: me.departmentId };
  if (input.status) where.status = input.status;

  const [total, rows] = await prisma.$transaction([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: { images: REPORT_IMAGES, category: true },
    }),
  ]);

  return {
    items: rows.map((r) => toPublicReport(r, true)),
    page: input.page,
    limit: input.limit,
    total,
    totalPages: Math.ceil(total / input.limit),
  };
}

/** Status-change timeline for a report (STAT-006). */
export async function getStatusHistory(reportId: string) {
  await assertReportExists(reportId);
  const history = await prisma.statusHistory.findMany({
    where: { reportId },
    orderBy: { createdAt: 'asc' },
    include: { changer: { select: { id: true, name: true, role: true } } },
  });
  return history.map((h) => ({
    id: h.id,
    oldStatus: h.oldStatus,
    newStatus: h.newStatus,
    note: h.note,
    changedBy: { id: h.changer.id, name: h.changer.name, role: h.changer.role },
    createdAt: h.createdAt,
  }));
}

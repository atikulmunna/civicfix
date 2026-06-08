/**
 * Admin/department report workflow (SRS v1.1 §6.10/6.11/6.12, §13).
 *
 * All status changes flow through `transitionStatus`, which enforces the §26
 * state machine (assertTransition), BR-005 department scoping, the required
 * side effects (internal note / duplicate target / assignment / resolvedAt),
 * and always writes a status_history row (BR-009/STAT-002).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { assertReportExists } from '../community/shared.js';
import { getVoteCounts } from '../community/votes.service.js';
import { createStatusChangeNotifications } from '../notifications/notifications.service.js';
import {
  getReportById,
  toPublicReport,
  type Actor,
} from '../reports/reports.service.js';
import {
  assertTransition,
  InvalidStatusTransitionError,
  type ReportStatus,
} from '../reports/status-machine.js';
import type { AdminListInput, DeptListInput } from './workflow.schemas.js';

const isAdmin = (a: Actor): boolean => a.role === 'admin' || a.role === 'super_admin';

export interface TransitionPayload {
  note?: string;
  internalNote?: string;
  duplicateOfReportId?: string;
  departmentId?: string;
}

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
    await assertReportExists(payload.duplicateOfReportId);
  }
  if (effects.createsAssignment) {
    if (!payload.departmentId) {
      throw new ApiError('VALIDATION_ERROR', 'A department is required to assign this report.');
    }
    const dept = await prisma.department.findUnique({ where: { id: payload.departmentId } });
    if (!dept || !dept.isActive) {
      throw new ApiError('VALIDATION_ERROR', 'The selected department does not exist.');
    }
  }

  const data: Prisma.ReportUpdateInput = { status: toStatus };
  if (effects.setsResolvedAt) data.resolvedAt = new Date();
  if (payload.internalNote !== undefined) data.internalNote = payload.internalNote;
  if (effects.requiresDuplicateTarget && payload.duplicateOfReportId) {
    data.duplicateOf = { connect: { id: payload.duplicateOfReportId } };
  }
  if (effects.createsAssignment && payload.departmentId) {
    data.assignedDepartment = { connect: { id: payload.departmentId } };
  }

  await prisma.$transaction(async (tx) => {
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
          assignedBy: actor.id,
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
        changedBy: actor.id,
        note: payload.note ?? null,
      },
    });

    // Notify subscribers of the change (§13.5, NOTIF-001/002/003).
    await createStatusChangeNotifications(tx, {
      reportId,
      reportTitle: report.title,
      newStatus: toStatus,
      actorId: actor.id,
    });
  });

  return getReportById(reportId, actor);
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
        ? [{ priorityScore: 'desc' }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }];

  const [total, rows] = await prisma.$transaction([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: { images: { orderBy: { createdAt: 'asc' } }, category: true },
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
      include: { images: { orderBy: { createdAt: 'asc' } }, category: true },
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

/**
 * Community-verified fixes (F3). Once a department marks a report RESOLVED,
 * residents check the fix: each confirms or disputes it with a photo of how
 * it looks now. Disputes from enough different residents reopen the report.
 *
 * A check belongs to one attempt at a fix, identified by the report's
 * resolved_at when it was made. Reopening clears that date and the next
 * resolution sets a new one, so every fix is checked afresh.
 */
import type { FixVerdict, Prisma, Report } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import type { StoredImage } from '../../lib/uploads.js';
import { applyTransition } from '../admin/workflow.service.js';
import type { Actor } from '../reports/reports.service.js';
import { transitionEffects } from '../reports/status-machine.js';

/** Disputes from different residents that reopen a fix. */
export const DISPUTES_TO_REOPEN = 2;

/** Checks listed per report, newest first. */
export const CHECKS_LIMIT = 50;

type Db = Prisma.TransactionClient;

type CheckedReport = Pick<
  Report,
  'id' | 'status' | 'title' | 'userId' | 'resolvedAt' | 'assignedDepartmentId'
>;

const CHECK_INCLUDE = {
  image: { select: { imageUrl: true } },
  user: { select: { id: true, name: true } },
} satisfies Prisma.FixCheckInclude;

type CheckRow = Prisma.FixCheckGetPayload<{ include: typeof CHECK_INCLUDE }>;

function toPublicCheck(c: CheckRow) {
  return {
    id: c.id,
    verdict: c.verdict,
    imageUrl: c.image.imageUrl,
    author: { id: c.user.id, name: c.user.name },
    resolvedAt: c.resolvedAt,
    createdAt: c.createdAt,
  };
}

async function loadReport(db: Db, reportId: string): Promise<CheckedReport> {
  const report = await db.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      status: true,
      title: true,
      userId: true,
      resolvedAt: true,
      assignedDepartmentId: true,
    },
  });
  if (!report) throw new ApiError('NOT_FOUND', 'Report not found.');
  return report;
}

/** The fix waiting to be checked: when the report was resolved, while it still is. */
function currentFix(report: Pick<Report, 'status' | 'resolvedAt'>): Date | null {
  return report.status === 'RESOLVED' ? report.resolvedAt : null;
}

/**
 * Anyone signed in may check a fix except admins, who oversee the work, and
 * staff of the department that did it. Their departments come from the
 * database, never from the request.
 */
async function mayCheck(
  db: Db,
  report: Pick<Report, 'assignedDepartmentId'>,
  actor: Actor,
): Promise<boolean> {
  if (actor.role === 'admin' || actor.role === 'super_admin') return false;
  if (actor.role !== 'department_worker') return true;
  const me = await db.user.findUnique({
    where: { id: actor.id },
    select: { departmentId: true },
  });
  return !me?.departmentId || me.departmentId !== report.assignedDepartmentId;
}

async function ownVerdict(
  db: Db,
  reportId: string,
  fix: Date,
  userId: string,
): Promise<FixVerdict | null> {
  const mine = await db.fixCheck.findUnique({
    where: { reportId_resolvedAt_userId: { reportId, resolvedAt: fix, userId } },
    select: { verdict: true },
  });
  return mine?.verdict ?? null;
}

/** The fix `actor` may check now, or the reason they may not. */
async function assertCheckable(db: Db, report: CheckedReport, actor: Actor): Promise<Date> {
  const fix = currentFix(report);
  if (!fix) {
    throw new ApiError('VALIDATION_ERROR', 'Only a resolved report has a fix to check.');
  }
  if (!(await mayCheck(db, report, actor))) {
    throw new ApiError(
      'FORBIDDEN',
      'Fixes are checked by residents, not by admins or the department that made them.',
    );
  }
  if (await ownVerdict(db, report.id, fix, actor.id)) {
    throw new ApiError('DUPLICATE_RESOURCE', 'You have already checked this fix.');
  }
  return fix;
}

/** Refuse early, before a photo is decoded and stored, if the check would be refused. */
export async function assertCanCheck(reportId: string, actor: Actor): Promise<void> {
  await assertCheckable(prisma, await loadReport(prisma, reportId), actor);
}

/** Record a check with its stored photo; reopens the report on enough disputes. */
export async function submitFixCheck(
  reportId: string,
  actor: Actor,
  verdict: FixVerdict,
  photo: StoredImage,
) {
  return prisma.$transaction(async (tx) => {
    // One check at a time per report. Two disputes arriving together must
    // each see the other, or neither would count enough to reopen it.
    await tx.$queryRaw`SELECT 1 FROM reports WHERE id = ${reportId}::uuid FOR UPDATE`;
    const report = await loadReport(tx, reportId);
    const fix = await assertCheckable(tx, report, actor);

    const image = await tx.reportImage.create({
      data: {
        reportId,
        imageUrl: photo.imageUrl,
        storageKey: photo.storageKey,
        imageType: 'after',
        uploadedBy: actor.id,
      },
    });
    const check = await tx.fixCheck.create({
      data: { reportId, userId: actor.id, imageId: image.id, verdict, resolvedAt: fix },
      include: CHECK_INCLUDE,
    });

    const reopened =
      verdict === 'disputed' &&
      (await tx.fixCheck.count({ where: { reportId, resolvedAt: fix, verdict: 'disputed' } })) >=
        DISPUTES_TO_REOPEN;
    if (reopened) await reopen(tx, report, actor.id);

    return { fixCheck: toPublicCheck(check), reopened };
  });
}

/** Back to the department: the same move as an admin's reopen, and the same records. */
async function reopen(tx: Db, report: CheckedReport, actorId: string): Promise<void> {
  await applyTransition(
    tx,
    report,
    'IN_PROGRESS',
    transitionEffects('RESOLVED', 'IN_PROGRESS'),
    actorId,
    { note: `Reopened: ${String(DISPUTES_TO_REOPEN)} residents disputed the fix with photos.` },
  );

  // The report is back in the department's queue; tell its staff why.
  if (!report.assignedDepartmentId) return;
  const staff = await tx.user.findMany({
    where: {
      departmentId: report.assignedDepartmentId,
      role: 'department_worker',
      isActive: true,
    },
    select: { id: true },
  });
  if (staff.length === 0) return;
  await tx.notification.createMany({
    data: staff.map((s) => ({
      userId: s.id,
      reportId: report.id,
      title: 'Fix disputed',
      message: `Residents disputed the fix for "${report.title}". It is back in progress.`,
      type: 'status_change' as const,
    })),
  });
}

async function tally(reportId: string, fix: Date) {
  const where = { reportId, resolvedAt: fix };
  const [confirmed, disputed] = await Promise.all([
    prisma.fixCheck.count({ where: { ...where, verdict: 'confirmed' } }),
    prisma.fixCheck.count({ where: { ...where, verdict: 'disputed' } }),
  ]);
  return { resolvedAt: fix, confirmed, disputed };
}

async function viewerOf(report: CheckedReport, fix: Date | null, actor: Actor) {
  if (!fix) return { verdict: null, canCheck: false };
  const [verdict, allowed] = await Promise.all([
    ownVerdict(prisma, report.id, fix, actor.id),
    mayCheck(prisma, report, actor),
  ]);
  return { verdict, canCheck: allowed && verdict === null };
}

/** A report's checks, the current fix's tally, and (signed in) the viewer's part. */
export async function listFixChecks(reportId: string, actor: Actor | null) {
  const report = await loadReport(prisma, reportId);
  const fix = currentFix(report);
  const [checks, total, current, viewer] = await Promise.all([
    prisma.fixCheck.findMany({
      where: { reportId },
      orderBy: { createdAt: 'desc' },
      take: CHECKS_LIMIT,
      include: CHECK_INCLUDE,
    }),
    prisma.fixCheck.count({ where: { reportId } }),
    fix ? tally(reportId, fix) : null,
    actor ? viewerOf(report, fix, actor) : undefined,
  ]);
  return {
    disputesToReopen: DISPUTES_TO_REOPEN,
    current,
    checks: checks.map(toPublicCheck),
    total,
    ...(viewer && { viewer }),
  };
}

/**
 * Reports business logic (SRS v1.1 §6.3/6.4, REP-*, LIST-*, MAP-009, DUP-*).
 * HTTP/multipart handled in routes; this stays framework-free and testable.
 */
import type { Prisma, Report, ReportImage, Category } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { sanitizeText } from '../../lib/sanitize.js';
import type { StoredImage } from '../../lib/uploads.js';
import { getVoteCounts } from '../community/votes.service.js';
import { findDuplicateIds, findNearbyIds } from './geo.js';
import type {
  CheckDuplicatesInput,
  CreateReportInput,
  ListReportsInput,
  MapInput,
  NearbyInput,
  UpdateReportInput,
} from './reports.schemas.js';

/** Minimal actor identity needed for authorization decisions. */
export interface Actor {
  id: string;
  role: 'citizen' | 'department_worker' | 'admin' | 'super_admin';
}

const isAdmin = (a: Actor | null): boolean => a?.role === 'admin' || a?.role === 'super_admin';

type ReportWithRelations = Report & {
  images?: ReportImage[];
  category?: Category | null;
};

/** Serialize a report for API output (§22.1). Hides internal_note (BR-012). */
export function toPublicReport(r: ReportWithRelations, canSeeInternal = false) {
  return {
    id: r.id,
    userId: r.userId,
    title: r.title,
    description: r.description,
    categoryId: r.categoryId,
    category: r.category
      ? { id: r.category.id, name: r.category.name, icon: r.category.icon }
      : undefined,
    status: r.status,
    severity: r.severity,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    address: r.address,
    landmark: r.landmark,
    assignedDepartmentId: r.assignedDepartmentId,
    priorityScore: r.priorityScore,
    duplicateOfReportId: r.duplicateOfReportId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    resolvedAt: r.resolvedAt,
    images: r.images?.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      imageType: img.imageType,
      createdAt: img.createdAt,
    })),
    ...(canSeeInternal ? { internalNote: r.internalNote } : {}),
  };
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive) {
    throw new ApiError('VALIDATION_ERROR', 'The selected category does not exist.');
  }
}

export async function createReport(
  userId: string,
  input: CreateReportInput,
  images: StoredImage[],
) {
  await assertCategoryExists(input.categoryId);

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        userId,
        title: sanitizeText(input.title),
        description: sanitizeText(input.description),
        categoryId: input.categoryId,
        severity: input.severity,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address ? sanitizeText(input.address) : null,
        landmark: input.landmark ? sanitizeText(input.landmark) : null,
        // status defaults to SUBMITTED (REP-007); location set by DB trigger.
      },
    });

    if (images.length > 0) {
      await tx.reportImage.createMany({
        data: images.map((img) => ({
          reportId: created.id,
          imageUrl: img.imageUrl,
          storageKey: img.storageKey,
          imageType: 'evidence' as const,
          uploadedBy: userId,
        })),
      });
    }

    // Initial status record (BR-009): null -> SUBMITTED.
    await tx.statusHistory.create({
      data: { reportId: created.id, oldStatus: null, newStatus: 'SUBMITTED', changedBy: userId, note: 'Report submitted.' },
    });

    // Subscribe the reporter to their own report (§13.5, NOTIF-003).
    await tx.reportSubscription.create({
      data: { reportId: created.id, userId, source: 'owner' },
    });

    return created;
  });

  return getReportById(report.id, { id: userId, role: 'citizen' });
}

export async function getReportById(id: string, actor: Actor | null) {
  const report = await prisma.report.findUnique({
    where: { id },
    include: { images: { orderBy: { createdAt: 'asc' } }, category: true },
  });
  if (!report) {
    throw new ApiError('NOT_FOUND', 'Report not found.');
  }
  const counts = (await getVoteCounts([id])).get(id);
  return { ...toPublicReport(report, isAdmin(actor)), counts };
}

export async function listReports(input: ListReportsInput) {
  const where: Prisma.ReportWhereInput = {};
  if (input.categoryId) where.categoryId = input.categoryId;
  if (input.status) where.status = input.status;
  if (input.severity) where.severity = input.severity;
  if (input.search) {
    where.OR = [
      { title: { contains: input.search, mode: 'insensitive' } },
      { description: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  // most_confirmed needs ordering by a filtered relation count, which Prisma
  // can't express in orderBy — handle it separately (LIST-005).
  if (input.sort === 'most_confirmed') {
    return listByMostConfirmed(where, input.page, input.limit);
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

  return paginated(rows, input.page, input.limit, await voteCountsFor(rows), total);
}

/**
 * List ordered by confirm count desc (then newest). Fetches matching ids +
 * confirm counts, sorts, then hydrates only the requested page.
 */
async function listByMostConfirmed(where: Prisma.ReportWhereInput, page: number, limit: number) {
  const idRows = await prisma.report.findMany({ where, select: { id: true, createdAt: true } });
  const confirmGroups = await prisma.vote.groupBy({
    by: ['reportId'],
    where: { reportId: { in: idRows.map((r) => r.id) }, voteType: 'confirm' },
    _count: { _all: true },
  });
  const confirms = new Map(confirmGroups.map((g) => [g.reportId, g._count._all]));

  idRows.sort((a, b) => {
    const diff = (confirms.get(b.id) ?? 0) - (confirms.get(a.id) ?? 0);
    return diff !== 0 ? diff : b.createdAt.getTime() - a.createdAt.getTime();
  });

  const total = idRows.length;
  const pageIds = idRows.slice((page - 1) * limit, page * limit).map((r) => r.id);
  const rows = await prisma.report.findMany({
    where: { id: { in: pageIds } },
    include: { images: { orderBy: { createdAt: 'asc' } }, category: true },
  });
  // Restore confirm-count order lost by findMany.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = pageIds.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r);

  return paginated(ordered, page, limit, await voteCountsFor(ordered), total);
}

async function voteCountsFor(rows: { id: string }[]) {
  return getVoteCounts(rows.map((r) => r.id));
}

function paginated(
  rows: ReportWithRelations[],
  page: number,
  limit: number,
  counts: Map<string, { upvotes: number; confirms: number; falseReports: number }>,
  total?: number,
) {
  const resolvedTotal = total ?? rows.length;
  return {
    items: rows.map((r) => ({ ...toPublicReport(r), counts: counts.get(r.id) })),
    page,
    limit,
    total: resolvedTotal,
    totalPages: Math.ceil(resolvedTotal / limit),
  };
}

/** Lightweight markers for the map viewport (MAP-009). */
export async function mapReports(input: MapInput) {
  const { minLng, minLat, maxLng, maxLat } = input.bbox;
  const where: Prisma.ReportWhereInput = {
    latitude: { gte: minLat, lte: maxLat },
    longitude: { gte: minLng, lte: maxLng },
  };
  if (input.status) where.status = input.status;
  if (input.categoryId) where.categoryId = input.categoryId;

  const rows = await prisma.report.findMany({
    where,
    take: input.limit,
    select: {
      id: true, title: true, status: true, severity: true,
      latitude: true, longitude: true, categoryId: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    severity: r.severity,
    categoryId: r.categoryId,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
  }));
}

export async function nearbyReports(input: NearbyInput) {
  const radius = input.radius ?? env.NEARBY_DEFAULT_RADIUS_M;
  const near = await findNearbyIds(input.lat, input.lng, radius, input.limit);
  if (near.length === 0) return [];

  const byId = await hydrate(near.map((n) => n.id));
  // Preserve nearest-first order and attach distance.
  return near
    .map((n) => {
      const r = byId.get(n.id);
      return r ? { ...toPublicReport(r), distanceM: Math.round(n.distance_m) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function checkDuplicates(input: CheckDuplicatesInput) {
  await assertCategoryExists(input.categoryId);
  const radius = input.radius ?? env.DUPLICATE_RADIUS_M;
  const dups = await findDuplicateIds(input.categoryId, input.latitude, input.longitude, radius);
  if (dups.length === 0) return { possibleDuplicates: [] };

  const byId = await hydrate(dups.map((d) => d.id));
  const possibleDuplicates = dups
    .map((d) => {
      const r = byId.get(d.id);
      return r ? { ...toPublicReport(r), distanceM: Math.round(d.distance_m) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return { possibleDuplicates };
}

export async function updateReport(id: string, actor: Actor, input: UpdateReportInput) {
  await loadForMutation(id, actor);
  if (input.categoryId) await assertCategoryExists(input.categoryId);

  await prisma.report.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: sanitizeText(input.title) }),
      ...(input.description !== undefined && { description: sanitizeText(input.description) }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.severity !== undefined && { severity: input.severity }),
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
      ...(input.address !== undefined && { address: input.address === null ? null : sanitizeText(input.address) }),
      ...(input.landmark !== undefined && { landmark: input.landmark === null ? null : sanitizeText(input.landmark) }),
    },
  });
  return getReportById(id, actor);
}

export async function deleteReport(id: string, actor: Actor): Promise<void> {
  await loadForMutation(id, actor);
  await prisma.report.delete({ where: { id } });
}

// --- internals ------------------------------------------------------------

/**
 * Load a report and enforce the edit/delete authorization rule (REP-012,
 * BR-013): the reporter may mutate only while status is SUBMITTED; admins may
 * always. Others are forbidden.
 */
async function loadForMutation(id: string, actor: Actor): Promise<Report> {
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) {
    throw new ApiError('NOT_FOUND', 'Report not found.');
  }
  if (isAdmin(actor)) return report;
  if (report.userId !== actor.id) {
    throw new ApiError('FORBIDDEN', 'You can only modify your own reports.');
  }
  if (report.status !== 'SUBMITTED') {
    throw new ApiError('FORBIDDEN', 'A report can only be edited or deleted while it is still under submission.');
  }
  return report;
}

/** Fetch many reports by id into a Map keyed by id. */
async function hydrate(ids: string[]): Promise<Map<string, ReportWithRelations>> {
  const rows = await prisma.report.findMany({
    where: { id: { in: ids } },
    include: { images: { orderBy: { createdAt: 'asc' } }, category: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

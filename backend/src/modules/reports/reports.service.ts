/**
 * Reports business logic (SRS v1.1 §6.3/6.4, REP-*, LIST-*, MAP-009, DUP-*).
 * HTTP/multipart handled in routes; this stays framework-free and testable.
 */
import type { Prisma, Report, ReportImage, Category } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { sanitizeText } from '../../lib/sanitize.js';
import { deleteStoredImages, type StoredImage } from '../../lib/uploads.js';
import { getVoteCounts, viewerState } from '../community/votes.service.js';
import { findDuplicateIds, findNearbyIds } from './geo.js';
import { priorityFromAnchor } from './priority.js';
import { refreshPriority } from './triage.service.js';
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
    priorityScore: priorityFromAnchor(r.priorityAnchor, new Date()),
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
  if (!category?.isActive) {
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
      data: {
        reportId: created.id,
        oldStatus: null,
        newStatus: 'SUBMITTED',
        changedBy: userId,
        note: 'Report submitted.',
      },
    });

    // Subscribe the reporter to their own report (§13.5, NOTIF-003).
    await tx.reportSubscription.create({
      data: { reportId: created.id, userId, source: 'owner' },
    });

    // Rank it for triage (F1).
    await refreshPriority(created.id, tx);

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
  const [counts, viewer] = await Promise.all([
    getVoteCounts([id]).then((m) => m.get(id)),
    actor ? viewerState(id, actor.id) : undefined,
  ]);
  return { ...toPublicReport(report, isAdmin(actor)), counts, ...(viewer && { viewer }) };
}

/**
 * Sort orders for the report list. "Most confirmed" uses the confirm_count
 * column kept in sync by a trigger on votes, so every sort runs as one indexed
 * query with the same filters (LIST-005).
 */
const ORDER_BY: Record<ListReportsInput['sort'], Prisma.ReportOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  // Closed reports have no anchor and come last (F1).
  priority: [{ priorityAnchor: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  most_confirmed: [{ confirmCount: 'desc' }, { createdAt: 'desc' }],
};

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

  const orderBy = ORDER_BY[input.sort];

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
      id: true,
      title: true,
      status: true,
      severity: true,
      latitude: true,
      longitude: true,
      categoryId: true,
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
      ...(input.address !== undefined && {
        address: input.address === null ? null : sanitizeText(input.address),
      }),
      ...(input.landmark !== undefined && {
        landmark: input.landmark === null ? null : sanitizeText(input.landmark),
      }),
    },
  });
  // Severity is part of the triage score (F1).
  if (input.severity !== undefined) await refreshPriority(id, prisma);
  return getReportById(id, actor);
}

export async function deleteReport(id: string, actor: Actor): Promise<void> {
  await loadForMutation(id, actor);
  // Image rows cascade with the report; read their storage keys first so the
  // files can be removed once the delete has committed.
  const images = await prisma.reportImage.findMany({
    where: { reportId: id, storageKey: { not: null } },
    select: { storageKey: true },
  });
  await prisma.report.delete({ where: { id } });
  await deleteStoredImages(images.flatMap((i) => (i.storageKey ? [i.storageKey] : [])));
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
    throw new ApiError(
      'FORBIDDEN',
      'A report can only be edited or deleted while it is still under submission.',
    );
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

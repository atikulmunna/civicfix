/**
 * Hotspots (F4): places where reports cluster. PostGIS finds the clusters
 * (hotspots.service.ts); this module turns them into summaries, so the rules
 * can be tested without a database.
 */
import type { ReportStatus } from '../../generated/prisma/enums.js';

/** Reports this close to one another (chained, DBSCAN style) form a hotspot. */
export const HOTSPOT_RADIUS_M = 150;
/** Reports a place needs before it counts as a hotspot. */
export const HOTSPOT_MIN_REPORTS = 3;
/** Reports from this many days back count, fixed ones included. */
export const HOTSPOT_WINDOW_DAYS = 90;
/** Hotspots returned, most reports first. */
export const HOTSPOT_LIMIT = 50;
/** Reports listed per hotspot, newest first. */
export const HOTSPOT_REPORTS_LISTED = 10;

/** No longer open: the work is done. */
const CLOSED: ReadonlySet<ReportStatus> = new Set<ReportStatus>(['RESOLVED', 'ARCHIVED']);

/** One report in a cluster, as the clustering query returns it. */
export interface ClusteredReport {
  clusterId: number;
  id: string;
  title: string;
  status: ReportStatus;
  categoryId: string;
  categoryName: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface Hotspot {
  latitude: number;
  longitude: number;
  /** From the centre to its farthest report. */
  radiusM: number;
  reportCount: number;
  openCount: number;
  /** Most reported first. */
  categories: { categoryId: string; name: string; count: number }[];
  recurring: boolean;
  latestReportAt: Date;
  reports: { id: string; title: string; status: ReportStatus; createdAt: Date }[];
}

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** True if a problem of one kind was reported here again after an earlier one was fixed. */
export function isRecurring(reports: readonly ClusteredReport[]): boolean {
  return reports.some((fixed) => {
    const fixedAt = fixed.resolvedAt;
    if (!fixedAt) return false;
    return reports.some(
      (later) =>
        later.id !== fixed.id &&
        later.categoryId === fixed.categoryId &&
        later.createdAt.getTime() > fixedAt.getTime(),
    );
  });
}

function summarizeOne(reports: readonly ClusteredReport[]): Hotspot {
  const centre = {
    latitude: reports.reduce((sum, r) => sum + r.latitude, 0) / reports.length,
    longitude: reports.reduce((sum, r) => sum + r.longitude, 0) / reports.length,
  };

  const byCategory = new Map<string, { categoryId: string; name: string; count: number }>();
  for (const r of reports) {
    const entry = byCategory.get(r.categoryId) ?? {
      categoryId: r.categoryId,
      name: r.categoryName,
      count: 0,
    };
    entry.count += 1;
    byCategory.set(r.categoryId, entry);
  }

  const newest = [...reports].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return {
    latitude: centre.latitude,
    longitude: centre.longitude,
    radiusM: Math.ceil(Math.max(...reports.map((r) => distanceM(centre, r)))),
    reportCount: reports.length,
    openCount: reports.filter((r) => !CLOSED.has(r.status)).length,
    categories: [...byCategory.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
    recurring: isRecurring(reports),
    // newest has at least one report: clusters come from rows.
    latestReportAt: newest[0]?.createdAt ?? new Date(0),
    reports: newest.slice(0, HOTSPOT_REPORTS_LISTED).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
}

/** One summary per cluster: most reports first, then most still open, then most recent. */
export function summarize(rows: readonly ClusteredReport[]): Hotspot[] {
  const clusters = new Map<number, ClusteredReport[]>();
  for (const row of rows) {
    const members = clusters.get(row.clusterId) ?? [];
    members.push(row);
    clusters.set(row.clusterId, members);
  }
  return [...clusters.values()]
    .map(summarizeOne)
    .sort(
      (a, b) =>
        b.reportCount - a.reportCount ||
        b.openCount - a.openCount ||
        b.latestReportAt.getTime() - a.latestReportAt.getTime(),
    )
    .slice(0, HOTSPOT_LIMIT);
}

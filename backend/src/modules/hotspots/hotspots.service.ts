/**
 * Hotspots and recurring problems (F4), from PostGIS.
 *
 * Hotspots: DBSCAN clustering (ST_ClusterDBSCAN) of the reports from the last
 * 90 days, fixed ones included; rejected reports and duplicates were never
 * separate problems, so they are left out. Recurrence: for one report, the
 * earlier reports of the same kind nearby that had been fixed before it was
 * made, so the problem came back.
 */
import { Prisma } from '../../generated/prisma/client.js';
import type { ReportStatus } from '../../generated/prisma/enums.js';
import { prisma } from '../../lib/prisma.js';
import { assertReportExists } from '../community/shared.js';
import {
  HOTSPOT_MIN_REPORTS,
  HOTSPOT_RADIUS_M,
  HOTSPOT_WINDOW_DAYS,
  summarize,
  type ClusteredReport,
} from './hotspot.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Earlier fixed reports listed for one report, most recently fixed first. */
export const RECURRENCE_LIMIT = 10;

/** Reports that count toward hotspots, as of `since`. */
const counted = (since: Date) => Prisma.sql`
  r.location IS NOT NULL
  AND r.created_at >= ${since}
  AND r.status NOT IN ('REJECTED', 'DUPLICATE')`;

export async function getHotspots(now: Date = new Date()) {
  const since = new Date(now.getTime() - HOTSPOT_WINDOW_DAYS * DAY_MS);
  const [scope] = await prisma.$queryRaw<{ latitude: number | null; total: number }[]>`
    SELECT AVG(r.latitude)::float8 AS latitude, COUNT(*)::int AS total
    FROM reports r
    WHERE ${counted(since)}`;

  let rows: ClusteredReport[] = [];
  if (scope?.latitude != null && scope.total >= HOTSPOT_MIN_REPORTS) {
    // DBSCAN runs in Web Mercator, whose metres stretch by 1/cos(latitude):
    // scale the radius to match at these reports' latitude.
    const eps = HOTSPOT_RADIUS_M / Math.cos((scope.latitude * Math.PI) / 180);
    rows = await prisma.$queryRaw<ClusteredReport[]>`
      SELECT * FROM (
        SELECT
          ST_ClusterDBSCAN(ST_Transform(r.location::geometry, 3857), eps := ${eps},
            minpoints := ${HOTSPOT_MIN_REPORTS}) OVER () AS "clusterId",
          r.id, r.title, r.status, r.category_id AS "categoryId", c.name AS "categoryName",
          r.latitude::float8 AS latitude, r.longitude::float8 AS longitude,
          r.created_at AS "createdAt", r.resolved_at AS "resolvedAt"
        FROM reports r
        JOIN categories c ON c.id = r.category_id
        WHERE ${counted(since)}
      ) AS clustered
      WHERE "clusterId" IS NOT NULL`;
  }

  return {
    generatedAt: now,
    windowDays: HOTSPOT_WINDOW_DAYS,
    radiusM: HOTSPOT_RADIUS_M,
    minReports: HOTSPOT_MIN_REPORTS,
    hotspots: summarize(rows),
  };
}

interface EarlierRow {
  id: string;
  title: string;
  status: ReportStatus;
  resolvedAt: Date;
  distanceM: number;
  total: number;
}

/** Earlier reports of the same kind near this one, fixed before it was made. */
export async function getRecurrence(reportId: string) {
  await assertReportExists(reportId);
  const rows = await prisma.$queryRaw<EarlierRow[]>`
    SELECT e.id, e.title, e.status, e.resolved_at AS "resolvedAt",
      ST_Distance(e.location, r.location)::float8 AS "distanceM",
      COUNT(*) OVER ()::int AS total
    FROM reports r
    JOIN reports e ON e.category_id = r.category_id AND e.id <> r.id
    WHERE r.id = ${reportId}::uuid
      AND r.location IS NOT NULL
      AND e.location IS NOT NULL
      AND e.resolved_at IS NOT NULL
      AND e.resolved_at <= r.created_at
      AND ST_DWithin(e.location, r.location, ${HOTSPOT_RADIUS_M})
    ORDER BY e.resolved_at DESC
    LIMIT ${RECURRENCE_LIMIT}`;
  return {
    radiusM: HOTSPOT_RADIUS_M,
    total: rows[0]?.total ?? 0,
    earlier: rows.map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      resolvedAt: e.resolvedAt,
      distanceM: Math.round(e.distanceM),
    })),
  };
}

/**
 * PostGIS-backed geospatial queries (LIST-008, DUP-001/002). Prisma cannot
 * express ST_DWithin against the `geography` column, so these use parameterised
 * raw SQL and return only ids (+ distance) — callers hydrate full rows via
 * Prisma to keep one serialization path.
 *
 * The bbox/map query lives in the service as a plain latitude/longitude range
 * filter (indexable, no geography needed).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/** Statuses excluded from duplicate matching (§6.9: terminal/inactive). */
const ACTIVE_DUP_FILTER = Prisma.sql`status NOT IN ('RESOLVED','REJECTED','DUPLICATE','ARCHIVED')`;

export interface NearbyRow {
  id: string;
  distance_m: number;
}

/** Report ids within `radiusM` metres of (lat,lng), nearest first. */
export async function findNearbyIds(
  lat: number,
  lng: number,
  radiusM: number,
  limit: number,
): Promise<NearbyRow[]> {
  const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
  return prisma.$queryRaw<NearbyRow[]>`
    SELECT id, ST_Distance(location, ${point}) AS distance_m
    FROM reports
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ${point}, ${radiusM})
    ORDER BY location <-> ${point}
    LIMIT ${limit}
  `;
}

/**
 * Possible-duplicate ids: same category, within `radiusM` metres, and in a
 * non-terminal status (§6.9). `excludeId` skips a report (e.g. the one being
 * checked after creation); pass undefined during pre-create checks.
 */
export async function findDuplicateIds(
  categoryId: string,
  lat: number,
  lng: number,
  radiusM: number,
  excludeId?: string,
): Promise<NearbyRow[]> {
  const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
  const exclude = excludeId ? Prisma.sql`AND id <> ${Prisma.sql`${excludeId}::uuid`}` : Prisma.empty;
  return prisma.$queryRaw<NearbyRow[]>`
    SELECT id, ST_Distance(location, ${point}) AS distance_m
    FROM reports
    WHERE location IS NOT NULL
      AND category_id = ${categoryId}::uuid
      AND ${ACTIVE_DUP_FILTER}
      ${exclude}
      AND ST_DWithin(location, ${point}, ${radiusM})
    ORDER BY location <-> ${point}
    LIMIT 10
  `;
}

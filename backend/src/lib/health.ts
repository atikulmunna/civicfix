/**
 * Health checks.
 *
 * - Liveness (`/health`): the process is up. Fly's machine check uses it, so
 *   it must never depend on the database: a database outage would otherwise
 *   take the whole API out of rotation instead of returning errors.
 * - Readiness (`/health/ready`): the API can serve real requests, meaning the
 *   database answers. Polled by the uptime monitor
 *   (.github/workflows/uptime.yml); it would have caught the paused Supabase
 *   database that silently broke every request while /health stayed green.
 */
import { prisma } from './prisma.js';

/** Long enough for a scaled-to-zero Neon compute to wake (usually under 2 s). */
export const DB_CHECK_TIMEOUT_MS = 10_000;

/** Resolves when the database answers `SELECT 1`; rejects on error or timeout. */
export async function checkDatabase(timeoutMs = DB_CHECK_TIMEOUT_MS): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Database check timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

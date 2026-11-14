/**
 * Helpers shared across the community sub-modules (comments, votes,
 * subscriptions). Kept here to avoid a cycle with the reports service.
 */
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { message } from '../../lib/messages.js';

/** Throw NOT_FOUND unless the report exists. */
export async function assertReportExists(reportId: string): Promise<void> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true },
  });
  if (!report) {
    throw new ApiError('NOT_FOUND', message('report.notFound'));
  }
}

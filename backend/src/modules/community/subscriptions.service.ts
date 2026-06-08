/**
 * Report subscriptions / follows (SRS v1.1 §6.13, NOTIF-007). Explicit
 * follows are rows with source = 'explicit'; owner and confirm sources are
 * created elsewhere (report creation, confirm vote). Subscriber resolution
 * for notifications (§13.5) reads this table in Module 7.
 */
import { prisma } from '../../lib/prisma.js';
import { assertReportExists } from './shared.js';

export async function follow(reportId: string, userId: string): Promise<{ following: boolean }> {
  await assertReportExists(reportId);
  await prisma.reportSubscription.createMany({
    data: [{ reportId, userId, source: 'explicit' }],
    skipDuplicates: true,
  });
  return { following: true };
}

export async function unfollow(reportId: string, userId: string): Promise<{ following: boolean }> {
  await assertReportExists(reportId);
  await prisma.reportSubscription.deleteMany({ where: { reportId, userId } });
  return { following: false };
}

/**
 * In-app notifications (SRS v1.1 §6.13, §13.5, NOTIF-001..004).
 *
 * On a status change the workflow resolves subscribers from
 * report_subscriptions (owner + confirmers + explicit followers) and writes a
 * notification per subscriber. Creation runs inside the workflow transaction
 * (accepts a tx client) so notifications are atomic with the status change.
 */
import type { Prisma, PrismaClient, ReportStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';

type Db = PrismaClient | Prisma.TransactionClient;

/** Human-readable status for notification messages. */
function readableStatus(status: ReportStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

/**
 * Create status-change notifications for every subscriber of a report except
 * the actor who triggered the change (NOTIF-001/002/003). Best run within the
 * status-change transaction.
 */
export async function createStatusChangeNotifications(
  db: Db,
  params: { reportId: string; reportTitle: string; newStatus: ReportStatus; actorId: string },
): Promise<void> {
  const subs = await db.reportSubscription.findMany({
    where: { reportId: params.reportId },
    select: { userId: true },
  });

  const recipients = subs.map((s) => s.userId).filter((id) => id !== params.actorId);
  if (recipients.length === 0) return;

  await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      reportId: params.reportId,
      title: 'Report status updated',
      message: `Your report "${params.reportTitle}" is now ${readableStatus(params.newStatus)}.`,
      type: 'status_change' as const,
    })),
  });
}

export interface ListNotificationsInput {
  unreadOnly: boolean;
  page: number;
  limit: number;
}

export async function listNotifications(userId: string, input: ListNotificationsInput) {
  const where: Prisma.NotificationWhereInput = { userId };
  if (input.unreadOnly) where.isRead = false;

  const [total, unreadCount, items] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return {
    items,
    unreadCount,
    page: input.page,
    limit: input.limit,
    total,
    totalPages: Math.ceil(total / input.limit),
  };
}

/** Mark a single notification read; only the owner may (NOTIF-004). */
export async function markRead(notificationId: string, userId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    throw new ApiError('NOT_FOUND', 'Notification not found.');
  }
  if (!notification.isRead) {
    await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
  }
}

/** Mark all of a user's notifications read; returns how many were updated. */
export async function markAllRead(userId: string): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { updated: result.count };
}

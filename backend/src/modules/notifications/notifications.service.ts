/**
 * In-app notifications (SRS v1.1 §6.13, §13.5, NOTIF-001..004).
 *
 * On a status change the workflow resolves subscribers from
 * report_subscriptions (owner + confirmers + explicit followers) and writes a
 * notification per subscriber. Creation runs inside the workflow transaction
 * (accepts a tx client) so notifications are atomic with the status change.
 */
import type {
  Notification,
  Prisma,
  PrismaClient,
  ReportStatus,
} from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { notificationEnglish, readKind, type KindedNotice } from './kinds.js';
import { message } from '../../lib/messages.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Create status-change notifications for every subscriber of a report except
 * the actor who triggered the change (NOTIF-001/002/003). Best run within the
 * status-change transaction.
 */
export async function createStatusChangeNotifications(
  db: Db,
  params: {
    reportId: string;
    reportTitle: string;
    newStatus: ReportStatus;
    actorId: string;
    /** The original's title when this change merged the report into it (F4). */
    mergedInto?: string;
  },
): Promise<void> {
  const subs = await db.reportSubscription.findMany({
    where: { reportId: params.reportId },
    select: { userId: true },
  });

  const recipients = subs.map((s) => s.userId).filter((id) => id !== params.actorId);
  if (recipients.length === 0) return;

  const notice: KindedNotice = params.mergedInto
    ? {
        kind: 'report_merged',
        params: { reportTitle: params.reportTitle, originalTitle: params.mergedInto },
      }
    : {
        kind: 'status_changed',
        params: { reportTitle: params.reportTitle, status: params.newStatus },
      };
  const { title, message } = notificationEnglish(notice);
  await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      reportId: params.reportId,
      title,
      message,
      type: 'status_change' as const,
      kind: notice.kind,
      params: notice.params,
    })),
  });
}

/** A row as the API sends it: its kind and params only when they fit (F5). */
function toPublicNotification(row: Notification) {
  const { kind, params, ...rest } = row;
  return { ...rest, ...(readKind(kind, params) ?? { kind: null, params: null }) };
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
    items: items.map(toPublicNotification),
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
  if (notification?.userId !== userId) {
    throw new ApiError('NOT_FOUND', message('notification.notFound'));
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

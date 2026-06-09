/**
 * Self-service profile (SRS v1.1 §9.3): the current user's profile and their
 * own reports. Distinct from the admin user management module.
 */
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { sanitizeText } from '../../lib/sanitize.js';
import { toPublicUser } from '../auth/auth.service.js';
import { toPublicReport } from '../reports/reports.service.js';
import { getVoteCounts } from '../community/votes.service.js';

export async function getMyProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found.');
  return toPublicUser(user);
}

export interface UpdateMeInput {
  name?: string;
  phone?: string | null;
  phoneIsPublic?: boolean;
}

export async function updateMyProfile(userId: string, input: UpdateMeInput) {
  const data: { name?: string; phone?: string | null; phoneIsPublic?: boolean } = {};
  if (input.name !== undefined) data.name = sanitizeText(input.name);
  if (input.phone !== undefined) data.phone = input.phone ? sanitizeText(input.phone) : null;
  if (input.phoneIsPublic !== undefined) data.phoneIsPublic = input.phoneIsPublic;

  const user = await prisma.user.update({ where: { id: userId }, data });
  return toPublicUser(user);
}

export async function listMyReports(userId: string, page: number, limit: number) {
  const where = { userId };
  const [total, rows] = await prisma.$transaction([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { images: { orderBy: { createdAt: 'asc' } }, category: true },
    }),
  ]);
  const counts = await getVoteCounts(rows.map((r) => r.id));
  return {
    items: rows.map((r) => ({ ...toPublicReport(r), counts: counts.get(r.id) })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

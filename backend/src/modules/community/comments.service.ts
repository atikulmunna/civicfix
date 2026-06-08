/**
 * Comments (SRS v1.1 §6.7, COM-*). Stored sanitized (COM-006); empty content
 * rejected (COM-005); deletes are soft (is_deleted) and allowed for the
 * author or an admin (COM-003/004).
 */
import type { Comment, User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { sanitizeText } from '../../lib/sanitize.js';
import { assertReportExists } from './shared.js';

interface Actor {
  id: string;
  role: 'citizen' | 'department_worker' | 'admin' | 'super_admin';
}

type CommentWithAuthor = Comment & { user: Pick<User, 'id' | 'name'> };

function toPublicComment(c: CommentWithAuthor) {
  return {
    id: c.id,
    reportId: c.reportId,
    content: c.content,
    author: { id: c.user.id, name: c.user.name },
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function addComment(reportId: string, userId: string, contentRaw: string) {
  await assertReportExists(reportId);
  const content = sanitizeText(contentRaw.trim());
  if (content.length === 0) {
    throw new ApiError('VALIDATION_ERROR', 'Comment cannot be empty.');
  }
  const comment = await prisma.comment.create({
    data: { reportId, userId, content },
    include: { user: { select: { id: true, name: true } } },
  });
  return toPublicComment(comment);
}

export async function listComments(reportId: string) {
  await assertReportExists(reportId);
  const comments = await prisma.comment.findMany({
    where: { reportId, isDeleted: false },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true } } },
  });
  return comments.map(toPublicComment);
}

export async function deleteComment(commentId: string, actor: Actor): Promise<void> {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.isDeleted) {
    throw new ApiError('NOT_FOUND', 'Comment not found.');
  }
  const isAdmin = actor.role === 'admin' || actor.role === 'super_admin';
  if (comment.userId !== actor.id && !isAdmin) {
    throw new ApiError('FORBIDDEN', 'You can only delete your own comments.');
  }
  await prisma.comment.update({ where: { id: commentId }, data: { isDeleted: true } });
}

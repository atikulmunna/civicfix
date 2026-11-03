/**
 * Admin user management (SRS v1.1 §9.3, AUTH-009/010, BR-014).
 * Admins may view and activate/deactivate users; only super admins may change
 * roles (route-enforced). Self-modification is blocked to avoid lockout.
 */
import { randomBytes } from 'node:crypto';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { hashPassword } from '../auth/password.js';
import type { Actor } from '../reports/reports.service.js';
import type { ListUsersInput, UserRoleInput } from './admin-crud.schemas.js';

function toAdminUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentId: u.departmentId,
    isActive: u.isActive,
    trustScore: u.trustScore,
    phone: u.phone,
    phoneIsPublic: u.phoneIsPublic,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export async function listUsers(input: ListUsersInput) {
  const where: Prisma.UserWhereInput = {};
  if (input.role) where.role = input.role;
  if (input.isActive !== undefined) where.isActive = input.isActive;
  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { email: { contains: input.search, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
  ]);

  return {
    items: rows.map(toAdminUser),
    page: input.page,
    limit: input.limit,
    total,
    totalPages: Math.ceil(total / input.limit),
  };
}

/**
 * Account management hierarchy: admins manage citizens and department
 * workers; super admins manage everyone. Nobody manages their own account
 * through admin routes (callers check that first, with a clearer message).
 */
export function canManageUser(actor: Actor, target: Pick<User, 'id' | 'role'>): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === 'super_admin') return true;
  return actor.role === 'admin' && target.role !== 'admin' && target.role !== 'super_admin';
}

/** Load a user an actor may manage, or throw NOT_FOUND / FORBIDDEN. */
async function loadManageableUser(userId: string, actor: Actor): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError('NOT_FOUND', 'User not found.');
  }
  if (!canManageUser(actor, user)) {
    throw new ApiError('FORBIDDEN', 'You do not have permission to manage this account.');
  }
  return user;
}

export async function setUserStatus(userId: string, isActive: boolean, actor: Actor) {
  if (userId === actor.id) {
    throw new ApiError('VALIDATION_ERROR', 'You cannot change your own account status.');
  }
  await loadManageableUser(userId, actor);
  const updated = await prisma.user.update({ where: { id: userId }, data: { isActive } });
  return toAdminUser(updated);
}

/**
 * Admin password reset (R19). Without email delivery there is no self-service
 * reset, so an admin issues a one-time temporary password, shown to them once
 * and never stored in plain text. The user is signed out everywhere and asked
 * to choose a new password at next sign-in (mustChangePassword).
 */
export async function resetUserPassword(userId: string, actor: Actor) {
  if (userId === actor.id) {
    throw new ApiError('VALIDATION_ERROR', 'Use Change password to change your own password.');
  }
  await loadManageableUser(userId, actor);
  // 16 URL-safe characters (96 bits): satisfies the password policy.
  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  logger.info({ actorId: actor.id, userId }, 'admin reset a user password');
  return { user: toAdminUser(updated), temporaryPassword };
}

export async function setUserRole(userId: string, input: UserRoleInput, actor: Actor) {
  if (userId === actor.id) {
    throw new ApiError('VALIDATION_ERROR', 'You cannot change your own role.');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError('NOT_FOUND', 'User not found.');
  }

  // If a department is supplied, validate it exists.
  if (input.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) {
      throw new ApiError('VALIDATION_ERROR', 'The selected department does not exist.');
    }
  }

  const data: Prisma.UserUpdateInput = { role: input.role };
  if (input.departmentId !== undefined) {
    data.department = input.departmentId
      ? { connect: { id: input.departmentId } }
      : { disconnect: true };
  }
  const updated = await prisma.user.update({ where: { id: userId }, data });
  return toAdminUser(updated);
}

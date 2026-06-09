/**
 * Admin user management (SRS v1.1 §9.3, AUTH-009/010, BR-014).
 * Admins may view and activate/deactivate users; only super admins may change
 * roles (route-enforced). Self-modification is blocked to avoid lockout.
 */
import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
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

export async function setUserStatus(userId: string, isActive: boolean, actor: Actor) {
  if (userId === actor.id) {
    throw new ApiError('VALIDATION_ERROR', 'You cannot change your own account status.');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError('NOT_FOUND', 'User not found.');
  }
  const updated = await prisma.user.update({ where: { id: userId }, data: { isActive } });
  return toAdminUser(updated);
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

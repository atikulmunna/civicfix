/**
 * Category & department management (SRS v1.1 §9.8/9.9). DELETE is a soft
 * disable (isActive=false) so existing reports keep their references.
 */
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { isUniqueViolation } from '../community/shared.js';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  DepartmentCreateInput,
  DepartmentUpdateInput,
} from './admin-crud.schemas.js';

// --- Categories ----------------------------------------------------------

export async function listCategories(includeInactive = false) {
  return prisma.category.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createCategory(input: CategoryCreateInput) {
  try {
    return await prisma.category.create({
      data: { name: input.name, description: input.description ?? null, icon: input.icon ?? null },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError('DUPLICATE_RESOURCE', 'A category with this name already exists.');
    }
    throw err;
  }
}

export async function updateCategory(id: string, input: CategoryUpdateInput) {
  await assertCategory(id);
  try {
    return await prisma.category.update({ where: { id }, data: input });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError('DUPLICATE_RESOURCE', 'A category with this name already exists.');
    }
    throw err;
  }
}

export async function disableCategory(id: string) {
  await assertCategory(id);
  return prisma.category.update({ where: { id }, data: { isActive: false } });
}

async function assertCategory(id: string): Promise<void> {
  const found = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw new ApiError('NOT_FOUND', 'Category not found.');
}

// --- Departments ---------------------------------------------------------

export async function listDepartments(includeInactive = false) {
  return prisma.department.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createDepartment(input: DepartmentCreateInput) {
  try {
    return await prisma.department.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        contactEmail: input.contactEmail ?? null,
        phone: input.phone ?? null,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError('DUPLICATE_RESOURCE', 'A department with this name already exists.');
    }
    throw err;
  }
}

export async function updateDepartment(id: string, input: DepartmentUpdateInput) {
  await assertDepartment(id);
  try {
    return await prisma.department.update({ where: { id }, data: input });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError('DUPLICATE_RESOURCE', 'A department with this name already exists.');
    }
    throw err;
  }
}

export async function disableDepartment(id: string) {
  await assertDepartment(id);
  return prisma.department.update({ where: { id }, data: { isActive: false } });
}

async function assertDepartment(id: string): Promise<void> {
  const found = await prisma.department.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw new ApiError('NOT_FOUND', 'Department not found.');
}

/**
 * Zod schemas for admin CRUD: users, categories, departments
 * (SRS v1.1 §9.3/9.8/9.9).
 */
import { z } from 'zod';

const role = z.enum(['citizen', 'department_worker', 'admin', 'super_admin']);
const boolFromQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

// --- Users ---------------------------------------------------------------

export const listUsersSchema = z.object({
  role: role.optional(),
  isActive: boolFromQuery.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type ListUsersInput = z.infer<typeof listUsersSchema>;

export const userStatusSchema = z.object({ isActive: z.boolean() });
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export const userRoleSchema = z.object({
  role,
  departmentId: z.string().uuid().nullable().optional(),
});
export type UserRoleInput = z.infer<typeof userRoleSchema>;

// --- Categories ----------------------------------------------------------

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional(),
  icon: z.string().trim().max(100).optional(),
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).nullable(),
    icon: z.string().trim().max(100).nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

// --- Departments ---------------------------------------------------------

export const departmentCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  contactEmail: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(30).optional(),
});
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;

export const departmentUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).nullable(),
    contactEmail: z.string().trim().email().max(255).nullable(),
    phone: z.string().trim().max(30).nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;

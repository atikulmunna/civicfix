/**
 * Admin CRUD routes: users (§9.3), categories (§9.8), departments (§9.9).
 * Public list endpoints for categories/departments; all mutations are admin,
 * and role changes are super-admin only (AUTH-010).
 */
import { Router } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { asyncHandler, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import type { Request } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/require-auth.js';
import * as users from './users.service.js';
import * as catalog from './catalog.service.js';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  departmentCreateSchema,
  departmentUpdateSchema,
  listUsersSchema,
  userRoleSchema,
  userStatusSchema,
} from './admin-crud.schemas.js';

function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
  }
  return result.data;
}

const ADMIN = ['admin', 'super_admin'] as const;

/** Honour ?includeInactive=true only for admins (public sees active only). */
function includeInactive(req: Request): boolean {
  const wants = req.query.includeInactive === 'true';
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
  return wants && isAdmin;
}

// --- Public catalog reads ------------------------------------------------

export const categoriesRouter = Router();
categoriesRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { categories: await catalog.listCategories(includeInactive(req)) });
  }),
);

export const departmentsRouter = Router();
departmentsRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { departments: await catalog.listDepartments(includeInactive(req)) });
  }),
);

// --- Admin users ---------------------------------------------------------

export const adminUsersRouter = Router();

adminUsersRouter.get(
  '/',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await users.listUsers(parse(listUsersSchema, req.query)));
  }),
);

adminUsersRouter.patch(
  '/:id/status',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    const { isActive } = parse(userStatusSchema, req.body);
    sendSuccess(res, { user: await users.setUserStatus(req.params.id, isActive, req.user!) });
  }),
);

adminUsersRouter.patch(
  '/:id/role',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(async (req, res) => {
    const input = parse(userRoleSchema, req.body);
    sendSuccess(res, { user: await users.setUserRole(req.params.id, input, req.user!) });
  }),
);

// --- Admin categories ----------------------------------------------------

export const adminCategoriesRouter = Router();

adminCategoriesRouter.post(
  '/',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { category: await catalog.createCategory(parse(categoryCreateSchema, req.body)) }, 201);
  }),
);
adminCategoriesRouter.patch(
  '/:id',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    const input = parse(categoryUpdateSchema, req.body);
    sendSuccess(res, { category: await catalog.updateCategory(req.params.id, input) });
  }),
);
adminCategoriesRouter.delete(
  '/:id',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { category: await catalog.disableCategory(req.params.id) });
  }),
);

// --- Admin departments ---------------------------------------------------

export const adminDepartmentsRouter = Router();

adminDepartmentsRouter.post(
  '/',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { department: await catalog.createDepartment(parse(departmentCreateSchema, req.body)) }, 201);
  }),
);
adminDepartmentsRouter.patch(
  '/:id',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    const input = parse(departmentUpdateSchema, req.body);
    sendSuccess(res, { department: await catalog.updateDepartment(req.params.id, input) });
  }),
);
adminDepartmentsRouter.delete(
  '/:id',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    sendSuccess(res, { department: await catalog.disableDepartment(req.params.id) });
  }),
);

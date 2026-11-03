/**
 * Admin CRUD routes: users (§9.3), categories (§9.8), departments (§9.9).
 * Public list endpoints for categories/departments; all mutations are admin,
 * and role changes are super-admin only (AUTH-010).
 */
import { Router } from 'express';
import { parseInput, routeParam, sendSuccess } from '../../lib/http.js';
import type { Request } from 'express';
import { authUser, optionalAuth, requireAuth, requireRole } from '../../middleware/require-auth.js';
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

const ADMIN = ['admin', 'super_admin'] as const;

/** Honour ?includeInactive=true only for admins (public sees active only). */
function includeInactive(req: Request): boolean {
  const wants = req.query.includeInactive === 'true';
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
  return wants && isAdmin;
}

// --- Public catalog reads ------------------------------------------------

export const categoriesRouter = Router();
categoriesRouter.get('/', optionalAuth, async (req, res) => {
  sendSuccess(res, { categories: await catalog.listCategories(includeInactive(req)) });
});

export const departmentsRouter = Router();
departmentsRouter.get('/', optionalAuth, async (req, res) => {
  sendSuccess(res, { departments: await catalog.listDepartments(includeInactive(req)) });
});

// --- Admin users ---------------------------------------------------------

export const adminUsersRouter = Router();

adminUsersRouter.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  sendSuccess(res, await users.listUsers(parseInput(listUsersSchema, req.query)));
});

adminUsersRouter.patch('/:id/status', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const { isActive } = parseInput(userStatusSchema, req.body);
  sendSuccess(res, {
    user: await users.setUserStatus(routeParam(req, 'id'), isActive, authUser(req)),
  });
});

// One-time temporary password (R19). Same hierarchy as status changes.
adminUsersRouter.post(
  '/:id/reset-password',
  requireAuth,
  requireRole(...ADMIN),
  async (req, res) => {
    sendSuccess(res, await users.resetUserPassword(routeParam(req, 'id'), authUser(req)));
  },
);

adminUsersRouter.patch('/:id/role', requireAuth, requireRole('super_admin'), async (req, res) => {
  const input = parseInput(userRoleSchema, req.body);
  sendSuccess(res, {
    user: await users.setUserRole(routeParam(req, 'id'), input, authUser(req)),
  });
});

// --- Admin categories ----------------------------------------------------

export const adminCategoriesRouter = Router();

adminCategoriesRouter.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  sendSuccess(
    res,
    { category: await catalog.createCategory(parseInput(categoryCreateSchema, req.body)) },
    201,
  );
});
adminCategoriesRouter.patch('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const input = parseInput(categoryUpdateSchema, req.body);
  sendSuccess(res, { category: await catalog.updateCategory(routeParam(req, 'id'), input) });
});
adminCategoriesRouter.delete('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  sendSuccess(res, { category: await catalog.disableCategory(routeParam(req, 'id')) });
});

// --- Admin departments ---------------------------------------------------

export const adminDepartmentsRouter = Router();

adminDepartmentsRouter.post('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  sendSuccess(
    res,
    { department: await catalog.createDepartment(parseInput(departmentCreateSchema, req.body)) },
    201,
  );
});
adminDepartmentsRouter.patch('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const input = parseInput(departmentUpdateSchema, req.body);
  sendSuccess(res, { department: await catalog.updateDepartment(routeParam(req, 'id'), input) });
});
adminDepartmentsRouter.delete('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  sendSuccess(res, { department: await catalog.disableDepartment(routeParam(req, 'id')) });
});

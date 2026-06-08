/**
 * Admin/department workflow routes (SRS v1.1 §9.7/9.9). Status changes run
 * through one transition service; the dedicated assign/resolve/duplicate
 * endpoints are focused wrappers over it.
 */
import { Router } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { asyncHandler, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/require-auth.js';
import * as workflow from './workflow.service.js';
import {
  adminListSchema,
  assignSchema,
  deptListSchema,
  duplicateSchema,
  resolveSchema,
  statusSchema,
} from './workflow.schemas.js';

function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
  }
  return result.data;
}

const ADMIN = ['admin', 'super_admin'] as const;
const DEPT_OR_ADMIN = ['department_worker', 'admin', 'super_admin'] as const;

// /api/v1/admin/reports
export const adminReportsRouter = Router();

adminReportsRouter.get(
  '/',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await workflow.listAdminReports(parse(adminListSchema, req.query)));
  }),
);

// Generic status change — dept workers permitted (state machine gates which).
adminReportsRouter.patch(
  '/:id/status',
  requireAuth,
  requireRole(...DEPT_OR_ADMIN),
  asyncHandler(async (req, res) => {
    const { status, ...payload } = parse(statusSchema, req.body);
    const report = await workflow.transitionStatus(req.params.id, req.user!, status, payload);
    sendSuccess(res, { report });
  }),
);

adminReportsRouter.patch(
  '/:id/assign',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    const input = parse(assignSchema, req.body);
    const report = await workflow.transitionStatus(req.params.id, req.user!, 'ASSIGNED', input);
    sendSuccess(res, { report });
  }),
);

adminReportsRouter.post(
  '/:id/resolve',
  requireAuth,
  requireRole(...DEPT_OR_ADMIN),
  asyncHandler(async (req, res) => {
    const input = parse(resolveSchema, req.body);
    const report = await workflow.transitionStatus(req.params.id, req.user!, 'RESOLVED', input);
    sendSuccess(res, { report });
  }),
);

adminReportsRouter.post(
  '/:id/duplicate',
  requireAuth,
  requireRole(...ADMIN),
  asyncHandler(async (req, res) => {
    const input = parse(duplicateSchema, req.body);
    const report = await workflow.transitionStatus(req.params.id, req.user!, 'DUPLICATE', input);
    sendSuccess(res, { report });
  }),
);

// /api/v1/department
export const departmentRouter = Router();

departmentRouter.get(
  '/reports',
  requireAuth,
  requireRole(...DEPT_OR_ADMIN),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await workflow.listDepartmentReports(req.user!, parse(deptListSchema, req.query)));
  }),
);

// /api/v1/reports/:id/history (public timeline, STAT-006)
export const reportHistoryRouter = Router();

reportHistoryRouter.get(
  '/:id/history',
  optionalAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { history: await workflow.getStatusHistory(req.params.id) });
  }),
);

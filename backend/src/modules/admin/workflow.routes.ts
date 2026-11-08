/**
 * Admin/department workflow routes (SRS v1.1 §9.7/9.9). Status changes run
 * through one transition service; the dedicated assign/resolve/duplicate
 * endpoints are focused wrappers over it.
 */
import { Router } from 'express';
import { parseInput, routeParam, sendSuccess } from '../../lib/http.js';
import { authUser, optionalAuth, requireAuth, requireRole } from '../../middleware/require-auth.js';
import { assertReportExists } from '../community/shared.js';
import { prisma } from '../../lib/prisma.js';
import { duplicateCandidates } from '../reports/reports.service.js';
import { explainPriority } from '../reports/triage.service.js';
import * as workflow from './workflow.service.js';
import {
  adminListSchema,
  assignSchema,
  deptListSchema,
  duplicateSchema,
  resolveSchema,
  statusSchema,
} from './workflow.schemas.js';

const ADMIN = ['admin', 'super_admin'] as const;
const DEPT_OR_ADMIN = ['department_worker', 'admin', 'super_admin'] as const;

// /api/v1/admin/reports
export const adminReportsRouter = Router();

adminReportsRouter.get('/', requireAuth, requireRole(...ADMIN), async (req, res) => {
  sendSuccess(res, await workflow.listAdminReports(parseInput(adminListSchema, req.query)));
});

// Generic status change: dept workers permitted (state machine gates which).
adminReportsRouter.patch(
  '/:id/status',
  requireAuth,
  requireRole(...DEPT_OR_ADMIN),
  async (req, res) => {
    const { status, ...payload } = parseInput(statusSchema, req.body);
    const report = await workflow.transitionStatus(
      routeParam(req, 'id'),
      authUser(req),
      status,
      payload,
    );
    sendSuccess(res, { report });
  },
);

adminReportsRouter.patch('/:id/assign', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const input = parseInput(assignSchema, req.body);
  const report = await workflow.transitionStatus(
    routeParam(req, 'id'),
    authUser(req),
    'ASSIGNED',
    input,
  );
  sendSuccess(res, { report });
});

adminReportsRouter.post(
  '/:id/resolve',
  requireAuth,
  requireRole(...DEPT_OR_ADMIN),
  async (req, res) => {
    const input = parseInput(resolveSchema, req.body);
    const report = await workflow.transitionStatus(
      routeParam(req, 'id'),
      authUser(req),
      'RESOLVED',
      input,
    );
    sendSuccess(res, { report });
  },
);

adminReportsRouter.post('/:id/duplicate', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const input = parseInput(duplicateSchema, req.body);
  const report = await workflow.transitionStatus(
    routeParam(req, 'id'),
    authUser(req),
    'DUPLICATE',
    input,
  );
  sendSuccess(res, { report });
});

// Likely originals to merge a report into (F4).
adminReportsRouter.get(
  '/:id/duplicate-candidates',
  requireAuth,
  requireRole(...ADMIN),
  async (req, res) => {
    sendSuccess(res, await duplicateCandidates(routeParam(req, 'id')));
  },
);

// Why a report ranks where it does (F1); null when it is closed (not ranked).
adminReportsRouter.get('/:id/priority', requireAuth, requireRole(...ADMIN), async (req, res) => {
  const id = routeParam(req, 'id');
  await assertReportExists(id);
  sendSuccess(res, { priority: await explainPriority(id, prisma) });
});

// /api/v1/department
export const departmentRouter = Router();

departmentRouter.get('/reports', requireAuth, requireRole(...DEPT_OR_ADMIN), async (req, res) => {
  sendSuccess(
    res,
    await workflow.listDepartmentReports(authUser(req), parseInput(deptListSchema, req.query)),
  );
});

// /api/v1/reports/:id/history (public timeline, STAT-006)
export const reportHistoryRouter = Router();

reportHistoryRouter.get('/:id/history', optionalAuth, async (req, res) => {
  sendSuccess(res, { history: await workflow.getStatusHistory(routeParam(req, 'id')) });
});

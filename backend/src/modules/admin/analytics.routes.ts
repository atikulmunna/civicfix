/**
 * Analytics routes (SRS v1.1 §9.7). Admin-only dashboard aggregations.
 */
import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../../lib/http.js';
import { requireAuth, requireRole } from '../../middleware/require-auth.js';
import * as analytics from './analytics.service.js';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requireRole('admin', 'super_admin'));

analyticsRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await analytics.getSummary());
  }),
);

analyticsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { categories: await analytics.getCategoryAnalytics() });
  }),
);

analyticsRouter.get(
  '/departments',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { departments: await analytics.getDepartmentAnalytics() });
  }),
);

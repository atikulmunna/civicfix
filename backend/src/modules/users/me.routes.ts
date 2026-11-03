/**
 * Self-service profile routes (SRS v1.1 §9.3), mounted at /api/v1/users.
 */
import { Router } from 'express';
import { sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { authUser, requireAuth } from '../../middleware/require-auth.js';
import { listMyReportsSchema, updateMeSchema } from './me.schemas.js';
import * as me from './me.service.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  sendSuccess(res, { user: await me.getMyProfile(authUser(req).id) });
});

usersRouter.patch('/me', requireAuth, async (req, res) => {
  const result = updateMeSchema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
  }
  sendSuccess(res, { user: await me.updateMyProfile(authUser(req).id, result.data) });
});

usersRouter.get('/me/reports', requireAuth, async (req, res) => {
  const parsed = listMyReportsSchema.safeParse(req.query);
  const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 20 };
  sendSuccess(res, await me.listMyReports(authUser(req).id, page, limit));
});

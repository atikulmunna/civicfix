/**
 * Self-service profile routes (SRS v1.1 §9.3), mounted at /api/v1/users.
 */
import { Router } from 'express';
import { parseInput, sendSuccess } from '../../lib/http.js';
import { authUser, requireAuth } from '../../middleware/require-auth.js';
import { listMyReportsSchema, updateMeSchema } from './me.schemas.js';
import * as me from './me.service.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  sendSuccess(res, { user: await me.getMyProfile(authUser(req).id) });
});

usersRouter.patch('/me', requireAuth, async (req, res) => {
  const input = parseInput(updateMeSchema, req.body);
  sendSuccess(res, { user: await me.updateMyProfile(authUser(req).id, input) });
});

usersRouter.get('/me/reports', requireAuth, async (req, res) => {
  const parsed = listMyReportsSchema.safeParse(req.query);
  const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 20 };
  sendSuccess(res, await me.listMyReports(authUser(req).id, page, limit));
});

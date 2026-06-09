/**
 * Self-service profile routes (SRS v1.1 §9.3), mounted at /api/v1/users.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/require-auth.js';
import * as me from './me.service.js';

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(30).nullable(),
    phoneIsPublic: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update.' });

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const usersRouter = Router();

usersRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { user: await me.getMyProfile(req.user!.id) });
  }),
);

usersRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = updateSchema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
    }
    sendSuccess(res, { user: await me.updateMyProfile(req.user!.id, result.data) });
  }),
);

usersRouter.get(
  '/me/reports',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    const { page, limit } = parsed.success ? parsed.data : { page: 1, limit: 20 };
    sendSuccess(res, await me.listMyReports(req.user!.id, page, limit));
  }),
);

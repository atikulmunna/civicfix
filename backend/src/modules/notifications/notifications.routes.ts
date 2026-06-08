/**
 * Notification routes (SRS v1.1 §9.10, NOTIF-004).
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/require-auth.js';
import * as notifications from './notifications.service.js';

const listSchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = listSchema.safeParse(req.query);
    if (!result.success) {
      throw new ApiError('VALIDATION_ERROR', 'Invalid request data.');
    }
    sendSuccess(res, await notifications.listNotifications(req.user!.id, result.data));
  }),
);

notificationsRouter.patch(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    sendSuccess(res, await notifications.markAllRead(req.user!.id));
  }),
);

notificationsRouter.patch(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await notifications.markRead(req.params.id, req.user!.id);
    sendSuccess(res, { read: true });
  }),
);

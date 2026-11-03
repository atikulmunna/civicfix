/**
 * Notification routes (SRS v1.1 §9.10, NOTIF-004).
 */
import { Router } from 'express';
import { routeParam, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { authUser, requireAuth } from '../../middleware/require-auth.js';
import { listNotificationsSchema } from './notifications.schemas.js';
import * as notifications from './notifications.service.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req, res) => {
  const result = listNotificationsSchema.safeParse(req.query);
  if (!result.success) {
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.');
  }
  sendSuccess(res, await notifications.listNotifications(authUser(req).id, result.data));
});

notificationsRouter.patch('/read-all', requireAuth, async (req, res) => {
  sendSuccess(res, await notifications.markAllRead(authUser(req).id));
});

notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
  await notifications.markRead(routeParam(req, 'id'), authUser(req).id);
  sendSuccess(res, { read: true });
});

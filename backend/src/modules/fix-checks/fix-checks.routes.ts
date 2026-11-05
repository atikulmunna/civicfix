/**
 * Fix checks (F3), mounted on the /reports prefix beside the reports and
 * community routers (distinct sub-paths, no conflict).
 */
import { Router } from 'express';
import { parseInput, routeParam, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { deleteStoredImages, storeImage, upload } from '../../lib/uploads.js';
import { authUser, optionalAuth, requireAuth } from '../../middleware/require-auth.js';
import { fixCheckLimiter } from '../../middleware/rate-limit.js';
import { fixCheckSchema } from './fix-checks.schemas.js';
import * as fixChecks from './fix-checks.service.js';

export const fixChecksRouter = Router();

fixChecksRouter.get('/:id/fix-checks', optionalAuth, async (req, res) => {
  sendSuccess(res, await fixChecks.listFixChecks(routeParam(req, 'id'), req.user ?? null));
});

// Multipart: `verdict` plus one `photo` of how it looks now.
fixChecksRouter.post(
  '/:id/fix-checks',
  requireAuth,
  fixCheckLimiter,
  upload.single('photo'),
  async (req, res) => {
    const { verdict } = parseInput(fixCheckSchema, req.body);
    if (!req.file) {
      throw new ApiError('VALIDATION_ERROR', 'Add a photo of how it looks now.');
    }
    const reportId = routeParam(req, 'id');
    const actor = authUser(req);
    // Refuse before the photo is decoded and stored; the service checks again under a lock.
    await fixChecks.assertCanCheck(reportId, actor);
    const photo = await storeImage(req.file);
    try {
      sendSuccess(res, await fixChecks.submitFixCheck(reportId, actor, verdict, photo), 201);
    } catch (err) {
      // Nothing was recorded: drop the photo.
      await deleteStoredImages([photo.storageKey]);
      throw err;
    }
  },
);

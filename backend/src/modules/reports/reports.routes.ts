/**
 * Reports routes (SRS v1.1 §9.4). Static sub-paths (/nearby, /map,
 * /check-duplicates) are declared before /:id so they aren't captured as ids.
 */
import { Router } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { asyncHandler, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { optionalAuth, requireAuth } from '../../middleware/require-auth.js';
import { reportLimiter } from '../../middleware/rate-limit.js';
import { storeImages, upload } from '../../lib/uploads.js';
import * as reports from './reports.service.js';
import type { Actor } from './reports.service.js';
import {
  checkDuplicatesSchema,
  createReportSchema,
  listReportsSchema,
  mapSchema,
  nearbySchema,
  updateReportSchema,
} from './reports.schemas.js';

function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
  }
  return result.data;
}

const actorOf = (req: { user?: Actor }): Actor | null => req.user ?? null;

export const reportsRouter = Router();

// Create — multipart with at least one image (REP-001/003/004).
reportsRouter.post(
  '/',
  requireAuth,
  reportLimiter,
  upload.array('images', 5),
  asyncHandler(async (req, res) => {
    const input = parse(createReportSchema, req.body);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new ApiError('VALIDATION_ERROR', 'At least one image is required.');
    }
    const images = await storeImages(files);
    const report = await reports.createReport(req.user!.id, input, images);
    sendSuccess(res, { report }, 201);
  }),
);

reportsRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const result = await reports.listReports(parse(listReportsSchema, req.query));
    sendSuccess(res, result);
  }),
);

reportsRouter.get(
  '/nearby',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const result = await reports.nearbyReports(parse(nearbySchema, req.query));
    sendSuccess(res, { items: result });
  }),
);

reportsRouter.get(
  '/map',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const result = await reports.mapReports(parse(mapSchema, req.query));
    sendSuccess(res, { items: result });
  }),
);

reportsRouter.post(
  '/check-duplicates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await reports.checkDuplicates(parse(checkDuplicatesSchema, req.body));
    sendSuccess(res, result);
  }),
);

reportsRouter.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const report = await reports.getReportById(req.params.id, actorOf(req));
    sendSuccess(res, { report });
  }),
);

reportsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parse(updateReportSchema, req.body);
    const report = await reports.updateReport(req.params.id, req.user!, input);
    sendSuccess(res, { report });
  }),
);

reportsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await reports.deleteReport(req.params.id, req.user!);
    sendSuccess(res, { deleted: true });
  }),
);

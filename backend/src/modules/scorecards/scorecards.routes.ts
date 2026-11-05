/**
 * Public department scorecards (F2), mounted at /api/v1/scorecards. No sign-in:
 * the point is public accountability.
 */
import { Router } from 'express';
import { sendSuccess } from '../../lib/http.js';
import { getScorecards } from './scorecards.service.js';

export const scorecardsRouter = Router();

scorecardsRouter.get('/', async (_req, res) => {
  sendSuccess(res, await getScorecards());
});

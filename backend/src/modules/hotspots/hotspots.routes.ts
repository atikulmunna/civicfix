/**
 * Hotspots (F4): public, like the map. The recurrence router shares the
 * /reports prefix with the other report sub-resources (distinct sub-paths).
 */
import { Router } from 'express';
import { routeParam, sendSuccess } from '../../lib/http.js';
import { getHotspots, getRecurrence } from './hotspots.service.js';

export const hotspotsRouter = Router();

hotspotsRouter.get('/', async (_req, res) => {
  sendSuccess(res, await getHotspots());
});

export const recurrenceRouter = Router();

recurrenceRouter.get('/:id/recurrence', async (req, res) => {
  sendSuccess(res, await getRecurrence(routeParam(req, 'id')));
});

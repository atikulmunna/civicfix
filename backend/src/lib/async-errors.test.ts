/**
 * Route handlers are plain async functions: Express 5 forwards their rejected
 * promises to the error middleware (Express 4 needed a wrapper). If that ever
 * stops being true, these requests hang or crash instead of answering.
 */
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { pinoHttp } from 'pino-http';
import { ApiError } from './errors.js';
import { errorHandler } from './error-handler.js';
import { createLogger } from './logger.js';

function appWithFailingRoutes() {
  const app = express();
  const discard = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  app.use(pinoHttp({ logger: createLogger(discard) }));
  app.get('/known', async () => {
    await Promise.resolve();
    throw new ApiError('NOT_FOUND', 'Report not found.');
  });
  app.get('/unexpected', async () => {
    await Promise.resolve();
    throw new Error('database exploded');
  });
  app.use(errorHandler);
  return app;
}

describe('async route errors', () => {
  it('turns a rejected ApiError into its envelope', async () => {
    const res = await request(appWithFailingRoutes()).get('/known');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Report not found.', code: 'NOT_FOUND' });
  });

  it('turns any other rejection into a generic 500 without its details', async () => {
    const res = await request(appWithFailingRoutes()).get('/unexpected');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(res.body)).not.toContain('database exploded');
  });
});

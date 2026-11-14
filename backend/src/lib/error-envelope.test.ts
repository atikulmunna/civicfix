/**
 * The error envelope carries a message key beside the English text (F5), so the
 * web app can word the error in the reader's language. Tested on a tiny app
 * with the real error handler.
 */
import { describe, expect, it } from 'vitest';
import express from 'express';
import multer from 'multer';
import request from 'supertest';
import { z } from 'zod';
import { env } from '../config/env.js';
import { errorHandler } from './error-handler.js';
import { ApiError } from './errors.js';
import { parseInput } from './http.js';
import { message, zodMessage } from './messages.js';

const schema = z.object({
  title: z.string().min(3, zodMessage('field.titleTooShort', { min: 3 })),
  count: z.number(),
});

function appThrowing(err: () => unknown) {
  const app = express();
  app.use(express.json());
  app.post('/x', () => {
    throw err();
  });
  app.post('/parse', (req) => {
    parseInput(schema, req.body);
  });
  app.use(errorHandler);
  return app;
}

describe('error envelope keys', () => {
  it('sends the key beside the unchanged English', async () => {
    const res = await request(
      appThrowing(() => new ApiError('NOT_FOUND', message('report.notFound'))),
    ).post('/x');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'Report not found.',
      code: 'NOT_FOUND',
      messageKey: 'report.notFound',
    });
  });

  it('sends params when the text has them', async () => {
    const err = () =>
      new ApiError('VALIDATION_ERROR', message('upload.tooManyPixels', { megapixels: 40 }));
    const res = await request(appThrowing(err)).post('/x');
    expect(res.body.message).toBe('Image dimensions are too large (max 40 megapixels).');
    expect(res.body.messageParams).toEqual({ megapixels: 40 });
  });

  it('leaves admin-only errors, thrown as plain text, without a key', async () => {
    const res = await request(appThrowing(() => new ApiError('FORBIDDEN', 'Admins only.'))).post(
      '/x',
    );
    expect(res.body.message).toBe('Admins only.');
    expect(res.body).not.toHaveProperty('messageKey');
  });

  it('keys validation failures and each issue whose message is a known one', async () => {
    const res = await request(appThrowing(() => null))
      .post('/parse')
      .send({ title: 'ab', count: 'many' });
    expect(res.status).toBe(400);
    expect(res.body.messageKey).toBe('common.invalidRequest');
    expect(res.body.details).toContainEqual({
      path: 'title',
      message: 'Title must be at least 3 characters.',
      messageKey: 'field.titleTooShort',
      messageParams: { min: 3 },
    });
    const count = (res.body.details as { path: string }[]).find((d) => d.path === 'count');
    expect(count).not.toHaveProperty('messageKey');
  });

  it('keys an image over the size limit', async () => {
    const res = await request(appThrowing(() => new multer.MulterError('LIMIT_FILE_SIZE'))).post(
      '/x',
    );
    expect(res.status).toBe(400);
    expect(res.body.messageKey).toBe('upload.tooLarge');
    expect(res.body.messageParams).toEqual({ bytes: env.MAX_UPLOAD_BYTES });
    expect(res.body.message).toBe(
      `Each image must be at most ${String(env.MAX_UPLOAD_BYTES)} bytes.`,
    );
  });
});

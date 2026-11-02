/**
 * Central Express error handler: every error becomes the standard envelope
 * (§22.1). Known errors (ApiError, mapped database errors, upload limits) are
 * client-facing; anything else is logged with its stack and returned as a
 * generic 500 that carries the request id, so a user's report can be matched
 * to the exact log line without leaking internals.
 */
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';
import { apiErrorFromPrisma } from './prisma-errors.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express recognizes error handlers by their four parameters, so this one
  // must be declared even though it is never called.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Known database outcomes (duplicate, missing record, malformed id) are
  // client or concurrency errors, not server faults: see lib/prisma-errors.ts.
  const apiError = err instanceof ApiError ? err : apiErrorFromPrisma(err);
  if (apiError) {
    res.status(apiError.status).json({
      success: false,
      message: apiError.message,
      code: apiError.code,
      ...(apiError.details ? { details: apiError.details } : {}),
    });
    return;
  }
  // Multer upload failures (e.g. file too large) are VALIDATION_ERROR.
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Each image must be at most ${env.MAX_UPLOAD_BYTES} bytes.`
        : `Upload error: ${err.message}.`;
    res.status(400).json({ success: false, message, code: 'VALIDATION_ERROR' });
    return;
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({
    success: false,
    message: 'Internal server error.',
    code: 'INTERNAL_ERROR',
    // app.ts always generates string ids; anything else is omitted.
    ...(typeof req.id === 'string' ? { requestId: req.id } : {}),
  });
}

/**
 * Response-envelope helpers (SRS v1.1 §22.1), a small async wrapper so route
 * handlers can `throw` instead of plumbing errors to next() by hand, and typed
 * accessors for request input (body/query validation, route params, cookies).
 */
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { ApiError } from './errors.js';

export function sendSuccess(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wrap an async route handler so rejected promises reach the error middleware. */
export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Validate request input against a Zod schema, raising VALIDATION_ERROR with
 * per-field details on failure. Returns the schema's parsed output type.
 */
export function parseInput<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
  }
  return result.data;
}

/**
 * A named route parameter (e.g. `:id`). Express always provides params that
 * appear in the matched path, so the throw only guards against a handler
 * reading a param its route does not declare.
 */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (value === undefined) {
    throw new ApiError('VALIDATION_ERROR', `Missing route parameter: ${name}.`);
  }
  return value;
}

/** A non-empty string cookie set by cookie-parser, or undefined. */
export function readCookie(req: Request, name: string): string | undefined {
  // cookie-parser types `req.cookies` as `any`; narrow before indexing.
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value: unknown = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

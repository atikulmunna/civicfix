/**
 * Response-envelope helpers (SRS v1.1 §22.1) and typed accessors for request
 * input (body/query validation, route params, cookies). Route handlers can be
 * async and simply throw: Express 5 forwards rejected promises to the error
 * middleware.
 */
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { ApiError } from './errors.js';

export function sendSuccess(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

/**
 * Validate request input against a Zod schema, raising VALIDATION_ERROR with
 * per-field details on failure. Returns the schema's parsed output type.
 */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      // Zod 4 paths are PropertyKey[]; String() keeps symbol keys from throwing.
      path: i.path.map(String).join('.'),
      message: i.message,
    }));
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
  }
  return result.data;
}

/**
 * A named route parameter (e.g. `:id`). Express always provides params that
 * appear in the matched path, so the throw only guards against a handler
 * reading a param its route does not declare. Express 5 types params as
 * `string | string[]` because wildcards (`/*name`) capture arrays; this API
 * has no wildcard routes, so anything but a string is rejected too.
 */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') {
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

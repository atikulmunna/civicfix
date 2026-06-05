/**
 * Response-envelope helpers (SRS v1.1 §22.1) and a small async wrapper so
 * route handlers can `throw` instead of plumbing errors to next() by hand.
 */
import type { NextFunction, Request, Response } from 'express';

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

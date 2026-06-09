/**
 * Rate limiting (ABUSE-003). Auth attempts are limited per IP; report and
 * comment creation per authenticated user. Exceeding a limit returns 429 with
 * the standard RATE_LIMITED envelope (§22.2).
 *
 * Limiters are disabled under NODE_ENV=test by default so the integration
 * suites aren't throttled; the dedicated rate-limit test opts back in.
 */
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env.js';

interface LimiterOptions {
  windowMs: number;
  max: number;
  /** 'user' keys by authenticated user id (use after requireAuth); else by IP. */
  by?: 'user' | 'ip';
  /** Skip when running tests (default true). */
  skipInTest?: boolean;
}

export function makeLimiter(opts: LimiterOptions): RateLimitRequestHandler {
  const skipInTest = opts.skipInTest ?? true;
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => skipInTest && env.NODE_ENV === 'test',
    keyGenerator:
      opts.by === 'user'
        ? (req: Request) => req.user?.id ?? req.ip ?? 'anonymous'
        : undefined, // default: client IP
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      });
    },
  });
}

const HOUR = 60 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;

export const authLimiter = makeLimiter({ windowMs: FIFTEEN_MIN, max: env.RATE_LIMIT_AUTH_PER_15MIN, by: 'ip' });
export const reportLimiter = makeLimiter({ windowMs: HOUR, max: env.RATE_LIMIT_REPORTS_PER_HOUR, by: 'user' });
export const commentLimiter = makeLimiter({ windowMs: HOUR, max: env.RATE_LIMIT_COMMENTS_PER_HOUR, by: 'user' });

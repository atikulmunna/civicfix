/**
 * Auth cookie management (SEC-011): httpOnly, Secure in production,
 * SameSite=Lax. The refresh cookie is path-scoped to the auth router so it is
 * only sent to /auth/refresh and /auth/logout (§6.1).
 */
import type { CookieOptions, Response } from 'express';
import { isProd } from '../../config/env.js';
import { ACCESS_COOKIE } from '../../middleware/require-auth.js';

export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_PATH = '/api/v1/auth';

// Access cookie lifetime is a fallback only — the JWT's own exp is
// authoritative. ~15 minutes mirrors JWT_ACCESS_EXPIRES_IN's default.
const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;

function base(): CookieOptions {
  return { httpOnly: true, secure: isProd, sameSite: 'lax' };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  refreshExpiresAt: Date,
): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base(), path: '/', maxAge: ACCESS_MAX_AGE_MS });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base(),
    path: REFRESH_PATH,
    expires: refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: REFRESH_PATH });
}

/**
 * Authentication + RBAC middleware (AUTH-007/008, SEC-003).
 *
 * requireAuth reads the access token from the httpOnly cookie or a
 * `Bearer` Authorization header (§6.1 allows either), verifies it, and
 * attaches { id, role } to req.user. requireRole gates by role.
 */
import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { ApiError } from '../lib/errors.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

export interface AuthUser {
  id: string;
  role: UserRole;
}

// Augment Express's Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const ACCESS_COOKIE = 'access_token';

function extractToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    throw new ApiError('AUTH_REQUIRED', 'Authentication required.');
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    throw new ApiError('AUTH_REQUIRED', 'Invalid or expired access token.');
  }
}

/**
 * Populate req.user when a valid token is present, but never reject. For
 * endpoints that are public yet behave differently for authenticated users
 * (e.g. admins see internal notes).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      // Ignore invalid/expired tokens on optional routes.
    }
  }
  next();
}

/** Restrict a route to the given roles (AUTH-008). Use after requireAuth. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError('AUTH_REQUIRED', 'Authentication required.');
    }
    if (!roles.includes(req.user.role)) {
      throw new ApiError('FORBIDDEN', 'You do not have permission to perform this action.');
    }
    next();
  };
}

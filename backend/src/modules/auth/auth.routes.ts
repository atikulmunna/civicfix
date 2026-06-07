/**
 * Auth routes (SRS v1.1 §9.2): register, login, logout, refresh, me.
 * Validation via Zod; cookies set by the cookies helper; all responses use
 * the §22.1 success envelope.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { authLimiter } from '../../middleware/rate-limit.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies.js';
import * as authService from './auth.service.js';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: z.string().trim().email('A valid email is required.').max(255),
  password: z.string().min(1, 'Password is required.'),
  phone: z.string().trim().max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('A valid email is required.'),
  password: z.string().min(1, 'Password is required.'),
});

/** Parse a body with a schema, raising VALIDATION_ERROR on failure. */
function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError('VALIDATION_ERROR', 'Invalid request data.', details);
  }
  return result.data;
}

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req.body);
    const { user, session } = await authService.register(input);
    setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);
    sendSuccess(res, { user }, 201);
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);
    const { user, session } = await authService.login(email, password);
    setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);
    sendSuccess(res, { user });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) {
      throw new ApiError('AUTH_REQUIRED', 'No refresh token provided.');
    }
    const session = await authService.refresh(raw);
    setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);
    sendSuccess(res, { refreshed: true });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    sendSuccess(res, { loggedOut: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await authService.getUserById(req.user!.id);
    if (!user) {
      throw new ApiError('NOT_FOUND', 'User not found.');
    }
    sendSuccess(res, { user });
  }),
);

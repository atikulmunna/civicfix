/**
 * Auth routes (SRS v1.1 §9.2): register, login, logout, refresh, me.
 * Validation via Zod; cookies set by the cookies helper; all responses use
 * the §22.1 success envelope.
 */
import { Router } from 'express';
import { parseInput, readCookie, sendSuccess } from '../../lib/http.js';
import { ApiError } from '../../lib/errors.js';
import { authUser, requireAuth } from '../../middleware/require-auth.js';
import { authLimiter } from '../../middleware/rate-limit.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies.js';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.schemas.js';
import * as authService from './auth.service.js';

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res) => {
  const input = parseInput(registerSchema, req.body);
  const { user, session } = await authService.register(input);
  setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);
  sendSuccess(res, { user }, 201);
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const { email, password } = parseInput(loginSchema, req.body);
  const { user, session } = await authService.login(email, password);
  setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);
  sendSuccess(res, { user });
});

authRouter.post('/refresh', async (req, res) => {
  const raw = readCookie(req, REFRESH_COOKIE);
  if (!raw) {
    throw new ApiError('AUTH_REQUIRED', 'No refresh token provided.');
  }
  const session = await authService.refresh(raw);
  setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);
  sendSuccess(res, { refreshed: true });
});

authRouter.post('/logout', async (req, res) => {
  await authService.logout(readCookie(req, REFRESH_COOKIE));
  clearAuthCookies(res);
  sendSuccess(res, { loggedOut: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await authService.getUserById(authUser(req).id);
  if (!user) {
    throw new ApiError('NOT_FOUND', 'User not found.');
  }
  sendSuccess(res, { user });
});

// Change password (R19). Rate-limited like sign-in, since it checks a password.
authRouter.post('/change-password', requireAuth, authLimiter, async (req, res) => {
  const { currentPassword, newPassword } = parseInput(changePasswordSchema, req.body);
  const { user, session } = await authService.changePassword(
    authUser(req).id,
    currentPassword,
    newPassword,
  );
  // Every other session was revoked; this device continues with fresh cookies.
  setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt);
  sendSuccess(res, { user });
});

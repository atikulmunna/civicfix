/**
 * Token handling for the auth module (SRS v1.1 §6.1).
 *
 * - Access token: short-lived stateless JWT carrying { sub, role }.
 * - Refresh token: opaque 256-bit random string. Only its SHA-256 hash is
 *   stored (refresh_tokens.token_hash); the raw value lives only in the
 *   client's httpOnly cookie. Rotated on every use, revocable server-side.
 */
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import type { UserRole } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

/** Verifies + decodes an access token. Throws if invalid/expired. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  return { sub: String(decoded.sub), role: decoded.role as UserRole };
}

/** A fresh opaque refresh token (raw value) plus its storage hash + expiry. */
export function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { raw, hash: hashRefreshToken(raw), expiresAt };
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

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

/**
 * The only algorithm we sign with and the only one verification accepts.
 * Pinning it rules out algorithm-confusion attacks (e.g. `none`, or a token
 * signed with a different algorithm) regardless of library defaults.
 */
const JWT_ALGORITHM = 'HS256';

const ROLES: readonly UserRole[] = ['citizen', 'department_worker', 'admin', 'super_admin'];
const isRole = (value: unknown): value is UserRole => ROLES.includes(value as UserRole);

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

/** Verifies + decodes an access token. Throws if invalid, expired or malformed. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [JWT_ALGORITHM] });
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || !isRole(decoded.role)) {
    throw new jwt.JsonWebTokenError('Malformed access token payload.');
  }
  return { sub: decoded.sub, role: decoded.role };
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

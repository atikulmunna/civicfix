/**
 * Password hashing (AUTH-003 / SEC-001) and policy (AUTH-013).
 *
 * Uses argon2id via @node-rs/argon2 — ships prebuilt native binaries (no
 * node-gyp build step), which keeps install reliable on Windows/CI.
 */
import { hash, verify } from '@node-rs/argon2';
import { ApiError } from '../../lib/errors.js';

// argon2id parameters — OWASP-recommended baseline (19 MiB, 2 passes).
const HASH_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** A tiny denylist of the most common passwords (AUTH-013). */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890',
  'qwerty123', 'qwertyuiop', 'iloveyou', 'admin123', 'letmein123',
  'welcome1', 'password123', '11111111', '00000000',
]);

/** Throws VALIDATION_ERROR if the password fails policy. */
export function assertPasswordPolicy(password: string): void {
  if (password.length < 8) {
    throw new ApiError('VALIDATION_ERROR', 'Password must be at least 8 characters.');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new ApiError('VALIDATION_ERROR', 'Password is too common; choose a stronger one.');
  }
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTS);
}

export function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  return verify(hashStr, password);
}

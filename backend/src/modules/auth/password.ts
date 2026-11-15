/**
 * Password hashing (AUTH-003 / SEC-001) and policy (AUTH-013).
 *
 * Uses argon2id via @node-rs/argon2, which ships prebuilt native binaries (no
 * node-gyp build step), which keeps install reliable on Windows/CI.
 */
import { hash, verify } from '@node-rs/argon2';
import { ApiError } from '../../lib/errors.js';
import { message } from '../../lib/messages.js';

// argon2id parameters: OWASP-recommended baseline (19 MiB, 2 passes).
const HASH_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** A tiny denylist of the most common passwords (AUTH-013). */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwertyuiop',
  'iloveyou',
  'admin123',
  'letmein123',
  'welcome1',
  'password123',
  '11111111',
  '00000000',
]);

/** Shortest password the policy accepts. */
export const MIN_PASSWORD_LENGTH = 8;

/** Throws VALIDATION_ERROR if the password fails policy. */
export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(
      'VALIDATION_ERROR',
      message('auth.passwordTooShort', { min: MIN_PASSWORD_LENGTH }),
    );
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new ApiError('VALIDATION_ERROR', message('auth.passwordCommon'));
  }
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTS);
}

export function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  return verify(hashStr, password);
}

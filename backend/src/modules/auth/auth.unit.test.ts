/**
 * Auth unit tests — pure logic, no DB. Password policy/hashing, token
 * round-trips, and the requireRole guard (SRS §17.1 unit-test scope).
 */
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { assertPasswordPolicy, hashPassword, verifyPassword } from './password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';
import { requireRole } from '../../middleware/require-auth.js';
import { ApiError } from '../../lib/errors.js';

describe('password policy (AUTH-013)', () => {
  it('accepts a strong password', () => {
    expect(() => assertPasswordPolicy('CorrectHorse9')).not.toThrow();
  });
  it('rejects passwords shorter than 8 chars', () => {
    expect(() => assertPasswordPolicy('short')).toThrow(ApiError);
  });
  it('rejects common passwords (case-insensitive)', () => {
    expect(() => assertPasswordPolicy('Password123')).toThrow(ApiError);
  });
});

describe('password hashing (AUTH-003)', () => {
  it('produces an argon2id hash that verifies', async () => {
    const hash = await hashPassword('CorrectHorse9');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'CorrectHorse9')).toBe(true);
    expect(await verifyPassword(hash, 'WrongPassword9')).toBe(false);
  });
});

describe('access tokens', () => {
  it('signs and verifies a payload round-trip', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'admin' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('admin');
  });
  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'citizen' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
});

describe('refresh tokens', () => {
  it('hashes deterministically and uniquely per token', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(hashRefreshToken(a.raw)).toBe(a.hash);
    expect(a.hash).not.toBe(b.hash);
    expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('requireRole (AUTH-008)', () => {
  function run(role: string | undefined, allowed: string[]) {
    const req = { user: role ? { id: 'u', role } : undefined } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requireRole(...(allowed as any))(req, {} as Response, next);
    return next as unknown as ReturnType<typeof vi.fn>;
  }

  it('calls next for an allowed role', () => {
    const next = run('admin', ['admin', 'super_admin']);
    expect(next).toHaveBeenCalledOnce();
  });
  it('throws FORBIDDEN for a disallowed role', () => {
    expect(() => run('citizen', ['admin'])).toThrow(ApiError);
  });
  it('throws AUTH_REQUIRED when unauthenticated', () => {
    expect(() => run(undefined, ['admin'])).toThrow(ApiError);
  });
});

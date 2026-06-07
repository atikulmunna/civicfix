/**
 * Auth business logic (SRS v1.1 §6.1, AUTH-001..006/012/013). Framework-free:
 * routes handle HTTP/cookies, this module handles users + token records so it
 * stays unit-testable and reusable.
 */
import type { User, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { assertPasswordPolicy, hashPassword, verifyPassword } from './password.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js';

/** User shape safe to return to clients (never includes passwordHash). */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  departmentId: string | null;
  trustScore: number;
  phone: string | null;
  phoneIsPublic: boolean;
  createdAt: Date;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentId: u.departmentId,
    trustScore: u.trustScore,
    phone: u.phone,
    phoneIsPublic: u.phoneIsPublic,
    createdAt: u.createdAt,
  };
}

/** Issued credentials. `refreshToken` is the raw value for the client cookie. */
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Create a refresh-token record and the matching access token for a user. */
async function issueSession(userId: string, role: UserRole): Promise<IssuedSession> {
  const { raw, hash, expiresAt } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hash, expiresAt },
  });
  return {
    accessToken: signAccessToken({ sub: userId, role }),
    refreshToken: raw,
    refreshExpiresAt: expiresAt,
  };
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export async function register(
  input: RegisterInput,
): Promise<{ user: PublicUser; session: IssuedSession }> {
  assertPasswordPolicy(input.password);

  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError('DUPLICATE_RESOURCE', 'An account with this email already exists.');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { name: input.name.trim(), email, passwordHash, phone: input.phone?.trim() || null },
  });

  const session = await issueSession(user.id, user.role);
  return { user: toPublicUser(user), session };
}

export async function login(
  emailRaw: string,
  password: string,
): Promise<{ user: PublicUser; session: IssuedSession }> {
  const email = emailRaw.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  // Verify against the found hash, or against a dummy hash when the email is
  // unknown — keeps response timing similar either way (anti-enumeration).
  const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password).catch(() => false);

  if (!user || !ok) {
    throw new ApiError('VALIDATION_ERROR', 'Invalid email or password.');
  }
  if (!user.isActive) {
    throw new ApiError('FORBIDDEN', 'This account has been deactivated.');
  }

  const session = await issueSession(user.id, user.role);
  return { user: toPublicUser(user), session };
}

/**
 * Rotate a refresh token (AUTH-012): validate the presented token, revoke it,
 * and issue a fresh access + refresh pair. A revoked/expired/unknown token is
 * rejected with AUTH_REQUIRED.
 */
export async function refresh(rawToken: string): Promise<IssuedSession> {
  const tokenHash = hashRefreshToken(rawToken);
  const record = await prisma.refreshToken.findFirst({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.revokedAt || record.expiresAt <= new Date()) {
    throw new ApiError('AUTH_REQUIRED', 'Invalid or expired session. Please log in again.');
  }
  if (!record.user.isActive) {
    throw new ApiError('FORBIDDEN', 'This account has been deactivated.');
  }

  // Rotate: revoke the presented token and issue a new one atomically.
  const next = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: { userId: record.userId, tokenHash: next.hash, expiresAt: next.expiresAt },
    }),
  ]);

  return {
    accessToken: signAccessToken({ sub: record.userId, role: record.user.role }),
    refreshToken: next.raw,
    refreshExpiresAt: next.expiresAt,
  };
}

/** Revoke a refresh token on logout (AUTH-006). Idempotent. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashRefreshToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toPublicUser(user) : null;
}

// --- internals ------------------------------------------------------------

// A precomputed argon2id hash of a random string, used for the no-such-user
// timing path in login(). Value is irrelevant; it only needs to be valid.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$czLkrCHLe6NvkuXHXwNtaw$IBHYzkTJQ83bT5xG1P6oRj2BqNppodKpLTzliTDr75w';

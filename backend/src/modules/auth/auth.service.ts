/**
 * Auth business logic (SRS v1.1 §6.1, AUTH-001..006/012/013). Framework-free:
 * routes handle HTTP/cookies, this module handles users + token records so it
 * stays unit-testable and reusable.
 */
import type { User, UserRole } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
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
  /** True after an admin reset: the client should ask for a new password. */
  mustChangePassword: boolean;
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
    mustChangePassword: u.mustChangePassword,
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
  await pruneExpiredSessions(userId);
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
  const duplicate = () =>
    new ApiError('DUPLICATE_RESOURCE', 'An account with this email already exists.');
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw duplicate();
  }

  const passwordHash = await hashPassword(input.password);
  // A blank or whitespace-only phone is stored as null, not ''.
  const phone = input.phone?.trim();
  // The check above is a fast path; the unique index decides a race between
  // two sign-ups (hashing between check and insert makes the race real).
  const user = await prisma.user
    .create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        phone: phone === undefined || phone === '' ? null : phone,
      },
    })
    .catch((err: unknown) => {
      throw isUniqueViolation(err) ? duplicate() : err;
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
  // unknown, which keeps response timing similar either way (anti-enumeration).
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
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  const now = new Date();

  if (!record || record.expiresAt <= now) {
    throw invalidSession();
  }
  if (record.revokedAt) {
    // Reuse detection: a rotated token presented again well after rotation
    // means it was copied and replayed, so end every session of that user.
    // Within the grace window it is two tabs refreshing at once; the loser
    // simply fails.
    if (now.getTime() - record.revokedAt.getTime() > REUSE_GRACE_MS) {
      await revokeAllSessions(record.userId);
      logger.warn({ userId: record.userId }, 'refresh token reuse detected; revoked all sessions');
    }
    throw invalidSession();
  }
  if (!record.user.isActive) {
    throw new ApiError('FORBIDDEN', 'This account has been deactivated.');
  }

  const next = await rotateRefreshToken(record, now);
  if (!next) {
    throw invalidSession();
  }
  await pruneExpiredSessions(record.userId);

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

/**
 * Change the signed-in user's password (R19). Requires the current password,
 * applies the password policy, and refuses reusing the current one. Every
 * session of the user is revoked (so a stolen session cannot outlive the
 * change) and a fresh one is issued for the caller.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ user: PublicUser; session: IssuedSession }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.isActive) {
    throw new ApiError('AUTH_REQUIRED', 'Please sign in again.');
  }
  if (!(await verifyPassword(user.passwordHash, currentPassword).catch(() => false))) {
    throw new ApiError('VALIDATION_ERROR', 'Your current password is incorrect.');
  }
  assertPasswordPolicy(newPassword);
  if (await verifyPassword(user.passwordHash, newPassword).catch(() => false)) {
    throw new ApiError('VALIDATION_ERROR', 'Choose a password different from your current one.');
  }

  const passwordHash = await hashPassword(newPassword);
  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  const session = await issueSession(updated.id, updated.role);
  return { user: toPublicUser(updated), session };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toPublicUser(user) : null;
}

// --- internals ------------------------------------------------------------

/**
 * How long after rotation a reused refresh token counts as a benign race
 * (two tabs refreshing together) rather than a replayed, stolen token.
 */
export const REUSE_GRACE_MS = 60_000;

function invalidSession(): ApiError {
  return new ApiError('AUTH_REQUIRED', 'Invalid or expired session. Please log in again.');
}

/**
 * Rotate a refresh token that was read as valid: revoke it and issue its
 * successor in one transaction. The revoke is conditional, so when requests
 * race with the same token Postgres lets exactly one win; the others get
 * null. Exported for a deterministic test of that race.
 */
export async function rotateRefreshToken(
  record: { id: string; userId: string },
  now: Date,
): Promise<ReturnType<typeof generateRefreshToken> | null> {
  const next = generateRefreshToken();
  const rotated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) return false;
    await tx.refreshToken.create({
      data: { userId: record.userId, tokenHash: next.hash, expiresAt: next.expiresAt },
    });
    return true;
  });
  return rotated ? next : null;
}

/** Revoke every active refresh token of a user (sign out everywhere). */
async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Delete a user's expired refresh tokens so the table stays bounded without a
 * scheduled job. Revoked but unexpired tokens are kept: reuse detection needs
 * them for as long as they could still be presented.
 */
async function pruneExpiredSessions(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
}

// A precomputed argon2id hash of a random string, used for the no-such-user
// timing path in login(). Value is irrelevant; it only needs to be valid.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$czLkrCHLe6NvkuXHXwNtaw$IBHYzkTJQ83bT5xG1P6oRj2BqNppodKpLTzliTDr75w';

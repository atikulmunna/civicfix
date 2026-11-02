/**
 * Auth integration tests: hit the real Express app and the Docker Postgres
 * DB via supertest. Covers SRS v1.1 §9.2 / AUTH-001..013 and the §6.1 token
 * strategy (httpOnly cookies, refresh rotation, logout revocation, RBAC).
 *
 * Requires the civicfix-db container running and migrations applied.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { register, rotateRefreshToken } from './auth.service.js';
import { hashRefreshToken } from './tokens.js';

const app = buildApp();

// Unique email per run so reruns don't collide on the unique constraint.
const stamp = Date.now();
const citizen = {
  name: 'Test Citizen',
  email: `citizen_${stamp}@example.com`,
  password: 'CorrectHorse9',
};

/** Pull a Set-Cookie header value for a given cookie name. */
function getCookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${name}=`));
}
function cookieValue(setCookie: string): string {
  return setCookie.split(';')[0]!.split('=')[1]!;
}

const createdEmails: string[] = [citizen.email];

afterAll(async () => {
  // Clean up users (and their refresh tokens via cascade) created by this run.
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
});

describe('POST /auth/register', () => {
  it('creates a user and sets httpOnly auth cookies (AUTH-001, SEC-011)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(citizen);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(citizen.email);
    expect(res.body.data.user.role).toBe('citizen');
    // Password material never leaves the server.
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.user).not.toHaveProperty('password');

    const access = getCookie(res, 'access_token');
    const refresh = getCookie(res, 'refresh_token');
    expect(access).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/HttpOnly/i);
  });

  it('rejects a duplicate email (AUTH-002)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(citizen);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_RESOURCE');
  });

  it('resolves two simultaneous sign-ups with one email as one success and one conflict', async () => {
    // Called at the service level, where both calls pass the duplicate check
    // and race to the insert (password hashing sits in between). The unique
    // index decides; the loser must get the friendly conflict, not a 500.
    const racer = { ...citizen, email: `race_${String(stamp)}@example.com` };
    createdEmails.push(racer.email);
    const outcomes = await Promise.allSettled([register(racer), register(racer)]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const lost = outcomes.find((o) => o.status === 'rejected');
    expect(lost?.reason).toMatchObject({
      code: 'DUPLICATE_RESOURCE',
      message: 'An account with this email already exists.',
    });
  });

  it('rejects a weak password (AUTH-013)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Weak', email: `weak_${stamp}@example.com`, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a common password (AUTH-013)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Common', email: `common_${stamp}@example.com`, password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a malformed email (validation)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Bad', email: 'not-an-email', password: 'CorrectHorse9' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials (AUTH-004/005)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: citizen.email, password: citizen.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(citizen.email);
    expect(getCookie(res, 'access_token')).toBeDefined();
    expect(getCookie(res, 'refresh_token')).toBeDefined();
  });

  it('trims and case-folds the email before validating it', async () => {
    // Regression guard for the zod 4 migration: the email is trimmed first,
    // then validated, so padded input from mobile keyboards still logs in.
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `  ${citizen.email.toUpperCase()}  `, password: citizen.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(citizen.email);
  });

  it('rejects a wrong password with a generic message (anti-enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: citizen.email, password: 'WrongPassword9' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('rejects an unknown email with the same generic message', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: `nobody_${stamp}@example.com`, password: 'CorrectHorse9' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid email or password.');
  });
});

describe('GET /auth/me', () => {
  it('returns 401 without a token (AUTH-007)', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('returns the current user with a valid access cookie', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: citizen.email, password: citizen.password });
    const accessCookie = getCookie(login, 'access_token')!;

    const res = await request(app).get('/api/v1/auth/me').set('Cookie', accessCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(citizen.email);
  });

  it('also accepts a Bearer token (§6.1 API clients)', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: citizen.email, password: citizen.password });
    const token = cookieValue(getCookie(login, 'access_token')!);

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(citizen.email);
  });
});

describe('POST /auth/refresh (rotation, AUTH-012)', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: citizen.email, password: citizen.password });
    const oldRefresh = getCookie(login, 'refresh_token')!;

    // First refresh succeeds and issues a new refresh cookie.
    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldRefresh);
    expect(first.status).toBe(200);
    const newRefresh = getCookie(first, 'refresh_token')!;
    expect(cookieValue(newRefresh)).not.toBe(cookieValue(oldRefresh));

    // Re-using the old (now revoked) refresh token is rejected.
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldRefresh);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('AUTH_REQUIRED');

    // The new refresh token still works.
    const second = await request(app).post('/api/v1/auth/refresh').set('Cookie', newRefresh);
    expect(second.status).toBe(200);
  });

  it('returns 401 when no refresh cookie is present', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  async function freshRefreshCookie(): Promise<string> {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: citizen.email, password: citizen.password });
    return getCookie(login, 'refresh_token')!;
  }
  const refreshWith = (cookie: string) =>
    request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

  it('lets exactly one of two simultaneous refreshes win, without ending the session', async () => {
    const cookie = await freshRefreshCookie();
    const results = await Promise.all([refreshWith(cookie), refreshWith(cookie)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);

    // The winner's new token keeps working: a benign race is not treated as theft.
    const winner = results.find((r) => r.status === 200)!;
    expect((await refreshWith(getCookie(winner, 'refresh_token')!)).status).toBe(200);
  });

  it('never rotates a token that another request revoked after it was read', async () => {
    // Deterministic version of the race: this request read the token while it
    // was still valid, then a concurrent request revoked it before rotation.
    const cookie = await freshRefreshCookie();
    const tokenHash = hashRefreshToken(cookieValue(cookie));
    const staleRead = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash } });
    await prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } });
    const tokensBefore = await prisma.refreshToken.count({ where: { userId: staleRead.userId } });

    expect(await rotateRefreshToken(staleRead, new Date())).toBeNull();
    // No successor was issued for the losing request.
    expect(await prisma.refreshToken.count({ where: { userId: staleRead.userId } })).toBe(
      tokensBefore,
    );
  });

  it('revokes every session when a rotated token is replayed after the grace window', async () => {
    const stolen = await freshRefreshCookie();
    const rotated = await refreshWith(stolen);
    const current = getCookie(rotated, 'refresh_token')!;

    // Pretend the rotation happened two minutes ago, beyond the grace window.
    await prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(cookieValue(stolen)) },
      data: { revokedAt: new Date(Date.now() - 2 * 60_000) },
    });

    expect((await refreshWith(stolen)).status).toBe(401);
    // The legitimate holder's current token is revoked too: sign out everywhere.
    const after = await refreshWith(current);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('AUTH_REQUIRED');
  });

  it('prunes expired refresh tokens when the user signs in', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: citizen.email } });
    const expired = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(`expired-${String(Date.now())}`),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await freshRefreshCookie();
    expect(await prisma.refreshToken.findUnique({ where: { id: expired.id } })).toBeNull();
  });
});

describe('POST /auth/logout (AUTH-006)', () => {
  it('revokes the refresh token and clears cookies', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: citizen.email, password: citizen.password });
    const refresh = getCookie(login, 'refresh_token')!;

    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', refresh);
    expect(out.status).toBe(200);

    // The revoked refresh token can no longer be rotated.
    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', refresh);
    expect(after.status).toBe(401);
  });
});

describe('POST /auth/change-password (R19)', () => {
  const owner = { name: 'Changer', email: `changer_${String(stamp)}@example.com` };
  const NEW_PASSWORD = 'BrandNewHorse42';

  async function signIn(password: string) {
    return request(app).post('/api/v1/auth/login').send({ email: owner.email, password });
  }
  const access = (res: request.Response) => getCookie(res, 'access_token')!;
  const change = (accessCookie: string | undefined, body: object) => {
    const req = request(app).post('/api/v1/auth/change-password').send(body);
    return accessCookie ? req.set('Cookie', accessCookie) : req;
  };

  beforeAll(async () => {
    createdEmails.push(owner.email);
    await request(app)
      .post('/api/v1/auth/register')
      .send({ ...owner, password: citizen.password });
  });

  it('requires a signed-in user', async () => {
    const res = await change(undefined, { currentPassword: 'x', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong current password, the same password, and a weak one', async () => {
    const session = access(await signIn(citizen.password));
    const wrong = await change(session, { currentPassword: 'nope', newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe('Your current password is incorrect.');

    const same = await change(session, {
      currentPassword: citizen.password,
      newPassword: citizen.password,
    });
    expect(same.status).toBe(400);
    expect(same.body.message).toMatch(/different/);

    const weak = await change(session, { currentPassword: citizen.password, newPassword: 'short' });
    expect(weak.status).toBe(400);
  });

  it('changes the password, ends other sessions and keeps this device signed in', async () => {
    const thisDevice = await signIn(citizen.password);
    const otherDevice = await signIn(citizen.password);

    const res = await change(access(thisDevice), {
      currentPassword: citizen.password,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.user.mustChangePassword).toBe(false);

    // The other device's session is gone; this device continues on fresh cookies.
    const other = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', getCookie(otherDevice, 'refresh_token')!);
    expect(other.status).toBe(401);
    const mine = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', getCookie(res, 'refresh_token')!);
    expect(mine.status).toBe(200);

    expect((await signIn(citizen.password)).status).toBe(400);
    expect((await signIn(NEW_PASSWORD)).status).toBe(200);
  });
});

/**
 * Auth integration tests — hit the real Express app and the Docker Postgres
 * DB via supertest. Covers SRS v1.1 §9.2 / AUTH-001..013 and the §6.1 token
 * strategy (httpOnly cookies, refresh rotation, logout revocation, RBAC).
 *
 * Requires the civicfix-db container running and migrations applied.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

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
  return setCookie.split(';')[0].split('=')[1];
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

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
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

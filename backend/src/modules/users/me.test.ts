/**
 * Self-service profile integration tests (§9.3): GET/PATCH /users/me and
 * GET /users/me/reports.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = buildApp();
const stamp = Date.now();
const email = `me_${stamp}@example.com`;
let token = '';
let userId = '';
let categoryId = '';

const bearer = (t: string) => ['Authorization', `Bearer ${t}`] as const;

beforeAll(async () => {
  await request(app).post('/api/v1/auth/register').send({ name: 'Me User', email, password: 'CorrectHorse9' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'CorrectHorse9' });
  const cookies = login.headers['set-cookie'] as unknown as string[];
  token = cookies.find((c) => c.startsWith('access_token='))!.split(';')[0].split('=')[1];
  userId = (await prisma.user.findUnique({ where: { email } }))!.id;
  categoryId = (await prisma.category.create({ data: { name: `Me Cat ${stamp}` } })).id;

  // Two own reports + one by someone else.
  await prisma.report.createMany({
    data: [
      { userId, title: 'My report 1', description: 'desc one here', categoryId, severity: 'low', latitude: 23.7, longitude: 90.4 },
      { userId, title: 'My report 2', description: 'desc two here', categoryId, severity: 'high', latitude: 23.7, longitude: 90.4 },
    ],
  });
});

afterAll(async () => {
  await prisma.report.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.$disconnect();
});

describe('GET /users/me', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/v1/users/me')).status).toBe(401);
  });
  it('returns the current profile without password material', async () => {
    const res = await request(app).get('/api/v1/users/me').set(...bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });
});

describe('PATCH /users/me', () => {
  it('updates name and phone visibility', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set(...bearer(token))
      .send({ name: 'Renamed User', phone: '0123456789', phoneIsPublic: true });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Renamed User');
    expect(res.body.data.user.phone).toBe('0123456789');
    expect(res.body.data.user.phoneIsPublic).toBe(true);
  });
  it('rejects an empty update', async () => {
    const res = await request(app).patch('/api/v1/users/me').set(...bearer(token)).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /users/me/reports', () => {
  it('returns only the current user’s reports with counts', async () => {
    const res = await request(app).get('/api/v1/users/me/reports').set(...bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items.every((r: { userId: string }) => r.userId === userId)).toBe(true);
    expect(res.body.data.items[0].counts).toBeDefined();
  });
});

/**
 * Bangla names for categories and departments (F5): stored by admins, sent
 * wherever a resident sees the name, and null (not "") when left empty.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = buildApp();
const stamp = Date.now();
const adminEmail = `bn_admin_${stamp}@example.com`;
const bearer = (t: string) => ['Authorization', `Bearer ${t}`] as const;
let adminToken = '';
const categoryIds: string[] = [];
const departmentIds: string[] = [];

async function registerAndLogin(email: string): Promise<string> {
  await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Admin', email, password: 'CorrectHorse9' });
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'CorrectHorse9' });
  const cookies = login.headers['set-cookie'] as unknown as string[];
  return cookies
    .find((c) => c.startsWith('access_token='))!
    .split(';')[0]!
    .split('=')[1]!;
}

beforeAll(async () => {
  await registerAndLogin(adminEmail);
  await prisma.user.update({ where: { email: adminEmail }, data: { role: 'admin' } });
  adminToken = await registerAndLogin(adminEmail);
});

afterAll(async () => {
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
  await prisma.$disconnect();
});

describe('Bangla names (F5)', () => {
  it('stores a category Bangla name trimmed, and an empty one as null', async () => {
    const named = await request(app)
      .post('/api/v1/admin/categories')
      .set(...bearer(adminToken))
      .send({ name: `Kerbs BN ${stamp}`, nameBn: '  ফুটপাত  ' });
    expect(named.status).toBe(201);
    categoryIds.push(named.body.data.category.id);
    expect(named.body.data.category.nameBn).toBe('ফুটপাত');

    const empty = await request(app)
      .post('/api/v1/admin/categories')
      .set(...bearer(adminToken))
      .send({ name: `Benches BN ${stamp}`, nameBn: '' });
    categoryIds.push(empty.body.data.category.id);
    expect(empty.body.data.category.nameBn).toBeNull();

    const list = await request(app).get('/api/v1/categories');
    const kerbs = (list.body.data.categories as { name: string; nameBn: string | null }[]).find(
      (c) => c.name === `Kerbs BN ${stamp}`,
    );
    expect(kerbs?.nameBn).toBe('ফুটপাত');
  });

  it('sets and clears a Bangla name on update', async () => {
    const id = categoryIds[1]!;
    const set = await request(app)
      .patch(`/api/v1/admin/categories/${id}`)
      .set(...bearer(adminToken))
      .send({ nameBn: 'বেঞ্চ' });
    expect(set.status).toBe(200);
    expect(set.body.data.category.nameBn).toBe('বেঞ্চ');

    const cleared = await request(app)
      .patch(`/api/v1/admin/categories/${id}`)
      .set(...bearer(adminToken))
      .send({ nameBn: '' });
    expect(cleared.body.data.category.nameBn).toBeNull();
  });

  it('stores a department Bangla name and sends it with the scorecards', async () => {
    const res = await request(app)
      .post('/api/v1/admin/departments')
      .set(...bearer(adminToken))
      .send({ name: `Lamps BN ${stamp}`, nameBn: 'বাতি বিভাগ' });
    expect(res.status).toBe(201);
    departmentIds.push(res.body.data.department.id);
    expect(res.body.data.department.nameBn).toBe('বাতি বিভাগ');

    const scorecards = await request(app).get('/api/v1/scorecards');
    const card = (
      scorecards.body.data.departments as { departmentId: string; nameBn: string | null }[]
    ).find((d) => d.departmentId === res.body.data.department.id);
    expect(card?.nameBn).toBe('বাতি বিভাগ');
  });
});

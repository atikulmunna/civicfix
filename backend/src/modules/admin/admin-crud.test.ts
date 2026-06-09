/**
 * Admin CRUD integration tests — users (§9.3), categories (§9.8),
 * departments (§9.9). Covers RBAC (admin vs super-admin), soft-disable,
 * duplicate handling, self-modification guards, and the deactivate->login
 * cross-check.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = buildApp();
const stamp = Date.now();

const emails = {
  admin: `cr_admin_${stamp}@example.com`,
  super: `cr_super_${stamp}@example.com`,
  citizen: `cr_citizen_${stamp}@example.com`,
  target: `cr_target_${stamp}@example.com`,
};

let adminToken = '';
let superToken = '';
let citizenToken = '';
let targetId = '';
let deptId = '';
const createdCategoryIds: string[] = [];
const createdDeptIds: string[] = [];

const bearer = (t: string) => ['Authorization', `Bearer ${t}`] as const;

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ name: 'User', email, password: 'CorrectHorse9' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'CorrectHorse9' });
  const cookies = login.headers['set-cookie'] as unknown as string[];
  return cookies.find((c) => c.startsWith('access_token='))!.split(';')[0].split('=')[1];
}

beforeAll(async () => {
  adminToken = await registerAndLogin(emails.admin);
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  adminToken = await registerAndLogin(emails.admin);

  superToken = await registerAndLogin(emails.super);
  await prisma.user.update({ where: { email: emails.super }, data: { role: 'super_admin' } });
  superToken = await registerAndLogin(emails.super);

  citizenToken = await registerAndLogin(emails.citizen);
  await registerAndLogin(emails.target);
  targetId = (await prisma.user.findUnique({ where: { email: emails.target } }))!.id;

  deptId = (await prisma.department.create({ data: { name: `Seed Dept ${stamp}` } })).id;
  createdDeptIds.push(deptId);
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  // Detach any workers from departments before removing departments.
  await prisma.user.updateMany({
    where: { id: { in: users.map((u) => u.id) } },
    data: { departmentId: null },
  });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.department.deleteMany({ where: { id: { in: createdDeptIds } } });
  await prisma.$disconnect();
});

describe('categories (§9.8)', () => {
  let catId = '';

  it('creates a category as admin, rejects citizens', async () => {
    const forbidden = await request(app)
      .post('/api/v1/admin/categories')
      .set(...bearer(citizenToken))
      .send({ name: `Lighting ${stamp}` });
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set(...bearer(adminToken))
      .send({ name: `Lighting ${stamp}`, icon: 'bulb' });
    expect(res.status).toBe(201);
    catId = res.body.data.category.id;
    createdCategoryIds.push(catId);
  });

  it('rejects a duplicate category name (409)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set(...bearer(adminToken))
      .send({ name: `Lighting ${stamp}` });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_RESOURCE');
  });

  it('lists active categories publicly', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.categories.some((c: { id: string }) => c.id === catId)).toBe(true);
  });

  it('updates and then soft-disables a category (DELETE hides it)', async () => {
    const upd = await request(app)
      .patch(`/api/v1/admin/categories/${catId}`)
      .set(...bearer(adminToken))
      .send({ name: `Street Lighting ${stamp}` });
    expect(upd.body.data.category.name).toBe(`Street Lighting ${stamp}`);

    const del = await request(app).delete(`/api/v1/admin/categories/${catId}`).set(...bearer(adminToken));
    expect(del.status).toBe(200);
    expect(del.body.data.category.isActive).toBe(false);

    const list = await request(app).get('/api/v1/categories');
    expect(list.body.data.categories.some((c: { id: string }) => c.id === catId)).toBe(false);
  });

  it('shows disabled categories to admins via includeInactive', async () => {
    const res = await request(app)
      .get('/api/v1/categories')
      .set(...bearer(adminToken))
      .query({ includeInactive: 'true' });
    expect(res.body.data.categories.some((c: { id: string }) => c.id === catId)).toBe(true);
  });
});

describe('departments (§9.9)', () => {
  it('creates, lists, and disables a department', async () => {
    const create = await request(app)
      .post('/api/v1/admin/departments')
      .set(...bearer(adminToken))
      .send({ name: `Water Board ${stamp}`, contactEmail: 'water@example.com' });
    expect(create.status).toBe(201);
    const id = create.body.data.department.id;
    createdDeptIds.push(id);

    const list = await request(app).get('/api/v1/departments');
    expect(list.body.data.departments.some((d: { id: string }) => d.id === id)).toBe(true);

    const del = await request(app).delete(`/api/v1/admin/departments/${id}`).set(...bearer(adminToken));
    expect(del.body.data.department.isActive).toBe(false);
  });
});

describe('users (§9.3)', () => {
  it('lists users for admins without password material; forbids citizens', async () => {
    const forbidden = await request(app).get('/api/v1/admin/users').set(...bearer(citizenToken));
    expect(forbidden.status).toBe(403);

    const res = await request(app).get('/api/v1/admin/users').set(...bearer(adminToken)).query({ limit: 100 });
    expect(res.status).toBe(200);
    const sample = res.body.data.items[0];
    expect(sample).not.toHaveProperty('passwordHash');
    expect(sample).toHaveProperty('isActive');
  });

  it('deactivates a user, who can then no longer log in', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${targetId}/status`)
      .set(...bearer(adminToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.user.isActive).toBe(false);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: emails.target, password: 'CorrectHorse9' });
    expect(login.status).toBe(403);

    // Reactivate for cleanliness.
    await request(app)
      .patch(`/api/v1/admin/users/${targetId}/status`)
      .set(...bearer(adminToken))
      .send({ isActive: true });
  });

  it('blocks changing your own status', async () => {
    const me = await prisma.user.findUnique({ where: { email: emails.admin } });
    const res = await request(app)
      .patch(`/api/v1/admin/users/${me!.id}/status`)
      .set(...bearer(adminToken))
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('lets a super admin change a role (AUTH-010); admins cannot', async () => {
    const asAdmin = await request(app)
      .patch(`/api/v1/admin/users/${targetId}/role`)
      .set(...bearer(adminToken))
      .send({ role: 'department_worker', departmentId: deptId });
    expect(asAdmin.status).toBe(403);

    const asSuper = await request(app)
      .patch(`/api/v1/admin/users/${targetId}/role`)
      .set(...bearer(superToken))
      .send({ role: 'department_worker', departmentId: deptId });
    expect(asSuper.status).toBe(200);
    expect(asSuper.body.data.user.role).toBe('department_worker');
    expect(asSuper.body.data.user.departmentId).toBe(deptId);
  });

  it('blocks changing your own role', async () => {
    const me = await prisma.user.findUnique({ where: { email: emails.super } });
    const res = await request(app)
      .patch(`/api/v1/admin/users/${me!.id}/role`)
      .set(...bearer(superToken))
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
  });
});

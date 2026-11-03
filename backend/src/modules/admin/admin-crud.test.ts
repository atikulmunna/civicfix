/**
 * Admin CRUD integration tests: users (§9.3), categories (§9.8),
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
  await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'User', email, password: 'CorrectHorse9' });
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

    const del = await request(app)
      .delete(`/api/v1/admin/categories/${catId}`)
      .set(...bearer(adminToken));
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
  it('creates, lists, updates and disables a department', async () => {
    const create = await request(app)
      .post('/api/v1/admin/departments')
      .set(...bearer(adminToken))
      .send({ name: `Water Board ${stamp}`, contactEmail: 'water@example.com' });
    expect(create.status).toBe(201);
    const id = create.body.data.department.id;
    createdDeptIds.push(id);

    const list = await request(app).get('/api/v1/departments');
    expect(list.body.data.departments.some((d: { id: string }) => d.id === id)).toBe(true);

    const upd = await request(app)
      .patch(`/api/v1/admin/departments/${id}`)
      .set(...bearer(adminToken))
      .send({ phone: '+880 2 555 0100' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.department).toMatchObject({ id, phone: '+880 2 555 0100' });

    const del = await request(app)
      .delete(`/api/v1/admin/departments/${id}`)
      .set(...bearer(adminToken));
    expect(del.body.data.department.isActive).toBe(false);
  });
});

describe('users (§9.3)', () => {
  it('lists users for admins without password material; forbids citizens', async () => {
    const forbidden = await request(app)
      .get('/api/v1/admin/users')
      .set(...bearer(citizenToken));
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(...bearer(adminToken))
      .query({ limit: 100 });
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

  it('stops admins from deactivating admins or super admins; super admins can', async () => {
    const superAdmin = await prisma.user.findUniqueOrThrow({ where: { email: emails.super } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: emails.admin } });

    const adminOnSuper = await request(app)
      .patch(`/api/v1/admin/users/${superAdmin.id}/status`)
      .set(...bearer(adminToken))
      .send({ isActive: false });
    expect(adminOnSuper.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.id } })).isActive).toBe(
      true,
    );

    const superOnAdmin = await request(app)
      .patch(`/api/v1/admin/users/${admin.id}/status`)
      .set(...bearer(superToken))
      .send({ isActive: false });
    expect(superOnAdmin.status).toBe(200);
    // Restore so later tests can use the admin token.
    await prisma.user.update({ where: { id: admin.id }, data: { isActive: true } });
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

describe('admin password reset (R19)', () => {
  const signIn = (password: string) =>
    request(app).post('/api/v1/auth/login').send({ email: emails.target, password });

  it('issues a one-time password, signs the user out and asks for a new one', async () => {
    const before = await signIn('CorrectHorse9');
    const oldRefresh = (before.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refresh_token='),
    )!;

    const res = await request(app)
      .post(`/api/v1/admin/users/${targetId}/reset-password`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    const temporary = res.body.data.temporaryPassword as string;
    expect(temporary).toMatch(/^[\w-]{16}$/);
    expect(res.body.data.user.mustChangePassword).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    // Existing sessions end; the old password no longer works.
    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldRefresh);
    expect(refreshed.status).toBe(401);
    expect((await signIn('CorrectHorse9')).status).toBe(400);

    // The temporary password works and the client is told to change it.
    const withTemp = await signIn(temporary);
    expect(withTemp.status).toBe(200);
    expect(withTemp.body.data.user.mustChangePassword).toBe(true);

    // Changing it clears the flag (and restores the fixture password).
    const access = (withTemp.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('access_token='),
    )!;
    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', access)
      .send({ currentPassword: temporary, newPassword: 'CorrectHorse9' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.mustChangePassword).toBe(false);
  });

  it('follows the account hierarchy and is not a way to change your own password', async () => {
    const superAdmin = await prisma.user.findUniqueOrThrow({ where: { email: emails.super } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: emails.admin } });

    const adminOnSuper = await request(app)
      .post(`/api/v1/admin/users/${superAdmin.id}/reset-password`)
      .set(...bearer(adminToken));
    expect(adminOnSuper.status).toBe(403);

    const self = await request(app)
      .post(`/api/v1/admin/users/${admin.id}/reset-password`)
      .set(...bearer(adminToken));
    expect(self.status).toBe(400);

    const citizen = await request(app)
      .post(`/api/v1/admin/users/${targetId}/reset-password`)
      .set(...bearer(citizenToken));
    expect(citizen.status).toBe(403);
  });
});

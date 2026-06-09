/**
 * Analytics integration tests (§6.14, §9.7, AN-001..009). Reports are seeded
 * directly via Prisma with controlled status/severity/timestamps. Global
 * summary numbers are asserted inclusively (the test DB is shared across
 * parallel suites); per-category and per-department numbers are exact because
 * the category/department are unique to this run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../auth/password.js';

const app = buildApp();
const stamp = Date.now();

const emails = {
  admin: `an_admin_${stamp}@example.com`,
  citizen: `an_citizen_${stamp}@example.com`,
};

let adminToken = '';
let citizenToken = '';
let categoryId = '';
let deptId = '';
let authorId = '';

const bearer = (t: string) => ['Authorization', `Bearer ${t}`] as const;
const HOUR = 60 * 60 * 1000;

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ name: 'User', email, password: 'CorrectHorse9' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'CorrectHorse9' });
  const cookies = login.headers['set-cookie'] as unknown as string[];
  return cookies.find((c) => c.startsWith('access_token='))!.split(';')[0].split('=')[1];
}

function seedReport(overrides: Record<string, unknown>) {
  return prisma.report.create({
    data: {
      userId: authorId,
      title: 'Seed report',
      description: 'Seeded for analytics.',
      categoryId,
      severity: 'low',
      latitude: 23.7,
      longitude: 90.4,
      ...overrides,
    },
  });
}

beforeAll(async () => {
  adminToken = await registerAndLogin(emails.admin);
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  adminToken = await registerAndLogin(emails.admin);
  citizenToken = await registerAndLogin(emails.citizen);

  const author = await prisma.user.create({
    data: { name: 'Author', email: `an_author_${stamp}@example.com`, passwordHash: await hashPassword('x') },
  });
  authorId = author.id;
  categoryId = (await prisma.category.create({ data: { name: `Analytics Cat ${stamp}` } })).id;
  deptId = (await prisma.department.create({ data: { name: `Analytics Dept ${stamp}` } })).id;

  const now = new Date();
  await seedReport({ status: 'SUBMITTED', severity: 'high' });
  await seedReport({ status: 'IN_PROGRESS', severity: 'urgent', assignedDepartmentId: deptId });
  await seedReport({
    status: 'RESOLVED', severity: 'medium', assignedDepartmentId: deptId,
    createdAt: new Date(now.getTime() - 2 * HOUR), resolvedAt: now,
  });
  await seedReport({
    status: 'RESOLVED', severity: 'low', assignedDepartmentId: deptId,
    createdAt: new Date(now.getTime() - 4 * HOUR), resolvedAt: now,
  });
  await seedReport({ status: 'REJECTED', severity: 'low' });
});

afterAll(async () => {
  await prisma.report.deleteMany({ where: { userId: authorId } });
  await prisma.user.deleteMany({ where: { email: { in: [...Object.values(emails), `an_author_${stamp}@example.com`] } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.department.deleteMany({ where: { id: deptId } });
  await prisma.$disconnect();
});

describe('RBAC', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/admin/analytics/summary')).status).toBe(401);
  });
  it('forbids non-admins', async () => {
    const res = await request(app).get('/api/v1/admin/analytics/summary').set(...bearer(citizenToken));
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/analytics/summary (AN-001/002/004/006/009)', () => {
  it('returns totals, breakdowns, resolution metrics, and trends', async () => {
    const res = await request(app).get('/api/v1/admin/analytics/summary').set(...bearer(adminToken));
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.totalReports).toBeGreaterThanOrEqual(5);
    expect(d.byStatus.RESOLVED).toBeGreaterThanOrEqual(2);
    expect(d.byStatus.SUBMITTED).toBeGreaterThanOrEqual(1);
    expect(d.bySeverity.urgent).toBeGreaterThanOrEqual(1);
    expect(d.unresolvedHighPriority).toBeGreaterThanOrEqual(2);
    expect(d.resolutionRate).toBeGreaterThan(0);
    expect(d.resolutionRate).toBeLessThanOrEqual(1);
    expect(typeof d.avgResolutionHours).toBe('number');
    expect(Array.isArray(d.monthlyTrends)).toBe(true);
    const month = new Date().toISOString().slice(0, 7);
    expect(d.monthlyTrends.some((m: { month: string }) => m.month === month)).toBe(true);
  });
});

describe('GET /admin/analytics/categories (AN-003)', () => {
  it('reports exact totals for the seeded category', async () => {
    const res = await request(app).get('/api/v1/admin/analytics/categories').set(...bearer(adminToken));
    const mine = res.body.data.categories.find((c: { categoryId: string }) => c.categoryId === categoryId);
    expect(mine).toMatchObject({ total: 5, resolved: 2 });
  });
});

describe('GET /admin/analytics/departments (AN-008)', () => {
  it('reports exact workload and resolution time for the seeded department', async () => {
    const res = await request(app).get('/api/v1/admin/analytics/departments').set(...bearer(adminToken));
    const mine = res.body.data.departments.find((d: { departmentId: string }) => d.departmentId === deptId);
    expect(mine).toMatchObject({ total: 3, openAssignments: 1, resolved: 2, avgResolutionHours: 3 });
  });
});

/**
 * Admin/department workflow integration tests — real app + Postgres.
 * Covers the §26 lifecycle (status/assign/resolve), side-effect validation
 * (reject note, duplicate target), invalid-transition rejection (STAT-007),
 * BR-005 department scoping, RBAC, the admin list, department queue, and the
 * status-history timeline (STAT-006).
 */
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { uploadDir } from '../../lib/uploads.js';

const app = buildApp();
const stamp = Date.now();

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const POINT = { lat: 23.75, lng: 90.39 };

const emails = {
  admin: `wf_admin_${stamp}@example.com`,
  worker: `wf_worker_${stamp}@example.com`,
  citizen: `wf_citizen_${stamp}@example.com`,
};

let categoryId = '';
let deptA = '';
let deptB = '';
let adminToken = '';
let workerToken = '';
let citizenToken = '';
const storedUrls: string[] = [];

const bearer = (t: string) => ['Authorization', `Bearer ${t}`] as const;

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ name: 'User', email, password: 'CorrectHorse9' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'CorrectHorse9' });
  const cookies = login.headers['set-cookie'] as unknown as string[];
  return cookies.find((c) => c.startsWith('access_token='))!.split(';')[0].split('=')[1];
}

async function createReport(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/reports')
    .set(...bearer(citizenToken))
    .field('title', 'Damaged pedestrian crossing')
    .field('description', 'The crossing markings have faded and the signal is broken.')
    .field('categoryId', categoryId)
    .field('severity', 'high')
    .field('latitude', String(POINT.lat))
    .field('longitude', String(POINT.lng))
    .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  storedUrls.push(res.body.data.report.images[0].imageUrl);
  return res.body.data.report.id;
}

beforeAll(async () => {
  categoryId = (await prisma.category.create({ data: { name: `Roads ${stamp}`, icon: 'road' } })).id;
  deptA = (await prisma.department.create({ data: { name: `Public Works ${stamp}` } })).id;
  deptB = (await prisma.department.create({ data: { name: `Sanitation Dept ${stamp}` } })).id;

  adminToken = await registerAndLogin(emails.admin);
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  adminToken = await registerAndLogin(emails.admin);

  workerToken = await registerAndLogin(emails.worker);
  await prisma.user.update({
    where: { email: emails.worker },
    data: { role: 'department_worker', departmentId: deptA },
  });
  workerToken = await registerAndLogin(emails.worker);

  citizenToken = await registerAndLogin(emails.citizen);
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.report.deleteMany({ where: { userId: { in: ids } } });
  // Workers/assignments reference departments; null the FK then delete users/depts.
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: [deptA, deptB] } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await Promise.all(
    storedUrls.map((u) => unlink(path.join(uploadDir, path.basename(u))).catch(() => {})),
  );
  await prisma.$disconnect();
});

describe('full lifecycle SUBMITTED -> RESOLVED (§26)', () => {
  it('walks the report through review, verify, assign, in-progress, resolve', async () => {
    const id = await createReport();

    const review = await request(app)
      .patch(`/api/v1/admin/reports/${id}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'UNDER_REVIEW' });
    expect(review.status).toBe(200);
    expect(review.body.data.report.status).toBe('UNDER_REVIEW');

    const verify = await request(app)
      .patch(`/api/v1/admin/reports/${id}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'VERIFIED' });
    expect(verify.body.data.report.status).toBe('VERIFIED');

    const assign = await request(app)
      .patch(`/api/v1/admin/reports/${id}/assign`)
      .set(...bearer(adminToken))
      .send({ departmentId: deptA, note: 'Public works to handle.' });
    expect(assign.status).toBe(200);
    expect(assign.body.data.report.status).toBe('ASSIGNED');
    expect(assign.body.data.report.assignedDepartmentId).toBe(deptA);

    const assignment = await prisma.reportAssignment.findFirst({
      where: { reportId: id, isCurrent: true },
    });
    expect(assignment?.departmentId).toBe(deptA);

    const start = await request(app)
      .patch(`/api/v1/admin/reports/${id}/status`)
      .set(...bearer(workerToken))
      .send({ status: 'IN_PROGRESS', note: 'Crew dispatched.' });
    expect(start.status).toBe(200);
    expect(start.body.data.report.status).toBe('IN_PROGRESS');

    const resolve = await request(app)
      .post(`/api/v1/admin/reports/${id}/resolve`)
      .set(...bearer(workerToken))
      .send({ note: 'Crossing repainted and signal fixed.' });
    expect(resolve.status).toBe(200);
    expect(resolve.body.data.report.status).toBe('RESOLVED');
    expect(resolve.body.data.report.resolvedAt).not.toBeNull();

    // Timeline (STAT-006): null->SUBMITTED + 5 transitions, in order.
    const hist = await request(app).get(`/api/v1/reports/${id}/history`);
    const statuses = hist.body.data.history.map((h: { newStatus: string }) => h.newStatus);
    expect(statuses).toEqual([
      'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED',
    ]);
    expect(hist.body.data.history.at(-1).changedBy.name).toBeDefined();
  });
});

describe('transition guards', () => {
  it('rejects an illegal transition with 422 (STAT-007)', async () => {
    const id = await createReport();
    const res = await request(app)
      .patch(`/api/v1/admin/reports/${id}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'RESOLVED' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('requires an internal note to reject (BR-011)', async () => {
    const id = await createReport();
    const without = await request(app)
      .patch(`/api/v1/admin/reports/${id}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'REJECTED' });
    expect(without.status).toBe(400);

    const withNote = await request(app)
      .patch(`/api/v1/admin/reports/${id}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'REJECTED', internalNote: 'Not a genuine issue.' });
    expect(withNote.status).toBe(200);
    expect(withNote.body.data.report.status).toBe('REJECTED');
  });

  it('marks a duplicate and rejects self-duplication (BR-010)', async () => {
    const original = await createReport();
    const dup = await createReport();

    const self = await request(app)
      .post(`/api/v1/admin/reports/${dup}/duplicate`)
      .set(...bearer(adminToken))
      .send({ duplicateOfReportId: dup });
    expect(self.status).toBe(400);

    const ok = await request(app)
      .post(`/api/v1/admin/reports/${dup}/duplicate`)
      .set(...bearer(adminToken))
      .send({ duplicateOfReportId: original });
    expect(ok.status).toBe(200);
    expect(ok.body.data.report.status).toBe('DUPLICATE');
    expect(ok.body.data.report.duplicateOfReportId).toBe(original);
  });
});

describe('BR-005 department scoping + RBAC', () => {
  it('forbids a worker from acting on a report assigned to another department', async () => {
    const id = await createReport();
    await prisma.report.update({
      where: { id },
      data: { status: 'ASSIGNED', assignedDepartmentId: deptB },
    });
    const res = await request(app)
      .patch(`/api/v1/admin/reports/${id}/status`)
      .set(...bearer(workerToken))
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(403);
  });

  it('forbids a citizen from using admin status endpoints (RBAC)', async () => {
    const id = await createReport();
    const res = await request(app)
      .patch(`/api/v1/admin/reports/${id}/status`)
      .set(...bearer(citizenToken))
      .send({ status: 'UNDER_REVIEW' });
    expect(res.status).toBe(403);
  });

  it('forbids a worker from assigning (admin-only endpoint)', async () => {
    const id = await createReport();
    const res = await request(app)
      .patch(`/api/v1/admin/reports/${id}/assign`)
      .set(...bearer(workerToken))
      .send({ departmentId: deptA });
    expect(res.status).toBe(403);
  });
});

describe('admin list + department queue', () => {
  it('lists reports for admins with internal notes visible (ADM-001/BR-012)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports')
      .set(...bearer(adminToken))
      .query({ categoryId, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0]).toHaveProperty('internalNote');
  });

  it('forbids non-admins from the admin list', async () => {
    const res = await request(app).get('/api/v1/admin/reports').set(...bearer(citizenToken));
    expect(res.status).toBe(403);
  });

  it('returns the worker department queue (DEPT-001)', async () => {
    const id = await createReport();
    await prisma.report.update({
      where: { id },
      data: { status: 'ASSIGNED', assignedDepartmentId: deptA },
    });
    const res = await request(app).get('/api/v1/department/reports').set(...bearer(workerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((r: { id: string }) => r.id === id)).toBe(true);
  });
});

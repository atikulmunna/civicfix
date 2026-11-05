/**
 * Public department scorecards (F2) through the API: reports walked through
 * the real workflow into a fresh department, one of them left overdue.
 */
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { deleteStoredImages } from '../../lib/uploads.js';

const app = buildApp();
const stamp = Date.now();
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWPgL8sDAAGLAPRp2A2cAAAAAElFTkSuQmCC',
  'base64',
);
const emails = {
  admin: `sc_admin_${stamp}@example.com`,
  citizen: `sc_citizen_${stamp}@example.com`,
};
let adminToken = '';
let citizenToken = '';
let categoryId = '';
let departmentId = '';
let otherDepartmentId = '';
const departmentName = `Drainage ${stamp}`;
const storedUrls: string[] = [];
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

const setStatus = (id: string, status: string) =>
  request(app)
    .patch(`/api/v1/admin/reports/${id}/status`)
    .set(...bearer(adminToken))
    .send({ status });

/** A high-severity report, verified and assigned to the test department. */
async function assignedReport(title: string): Promise<string> {
  const created = await request(app)
    .post('/api/v1/reports')
    .set(...bearer(citizenToken))
    .field('title', title)
    .field('description', 'Water is pooling across the whole road after rain.')
    .field('categoryId', categoryId)
    .field('severity', 'high')
    .field('latitude', '23.77')
    .field('longitude', '90.40')
    .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  storedUrls.push(created.body.data.report.images[0].imageUrl);
  const id: string = created.body.data.report.id;
  for (const status of ['UNDER_REVIEW', 'VERIFIED']) await setStatus(id, status);
  const assigned = await request(app)
    .patch(`/api/v1/admin/reports/${id}/assign`)
    .set(...bearer(adminToken))
    .send({ departmentId });
  expect(assigned.status).toBe(200);
  return id;
}

const startWork = (id: string) => setStatus(id, 'IN_PROGRESS');

const resolve = (id: string) =>
  request(app)
    .post(`/api/v1/admin/reports/${id}/resolve`)
    .set(...bearer(adminToken))
    .send({ note: 'Drain cleared.' });

beforeAll(async () => {
  categoryId = (await prisma.category.create({ data: { name: `Flooding ${stamp}` } })).id;
  departmentId = (await prisma.department.create({ data: { name: departmentName } })).id;
  otherDepartmentId = (await prisma.department.create({ data: { name: `Roads ${stamp}` } })).id;
  adminToken = await registerAndLogin(emails.admin);
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  adminToken = await registerAndLogin(emails.admin);
  citizenToken = await registerAndLogin(emails.citizen);
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.report.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: [departmentId, otherDepartmentId] } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await deleteStoredImages(storedUrls.map((u) => path.basename(u)));
  await prisma.$disconnect();
});

describe('GET /scorecards (F2)', () => {
  it("scores a department's response and resolution against the targets", async () => {
    const fixed = await assignedReport('Blocked drain, fixed');
    await startWork(fixed);
    await resolve(fixed);

    const working = await assignedReport('Blocked drain, in progress');
    await startWork(working);

    // Assigned just now and untouched: no response yet, but not late either.
    await assignedReport('Blocked drain, just assigned');

    // Resolved, then reopened: open again, so not a resolution.
    const reopened = await assignedReport('Blocked drain, reopened');
    await startWork(reopened);
    await resolve(reopened);
    await startWork(reopened);

    // Reassigned: counts only for the department it is with now.
    const moved = await assignedReport('Blocked drain, moved');
    await setStatus(moved, 'VERIFIED');
    await request(app)
      .patch(`/api/v1/admin/reports/${moved}/assign`)
      .set(...bearer(adminToken))
      .send({ departmentId: otherDepartmentId });

    // Assigned 10 days ago and never touched: past both high targets (48 h, 168 h).
    const stale = await assignedReport('Blocked drain, ignored');
    await prisma.reportAssignment.updateMany({
      where: { reportId: stale, isCurrent: true },
      data: { createdAt: new Date(Date.now() - 10 * 24 * 3_600_000) },
    });

    // Public: no sign-in.
    const res = await request(app).get('/api/v1/scorecards');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      windowDays: 90,
      targets: { response: { high: 48 }, resolution: { high: 168 } },
    });

    const card = res.body.data.departments.find(
      (d: { departmentId: string }) => d.departmentId === departmentId,
    );
    expect(card).toMatchObject({
      name: departmentName,
      assigned: 5,
      resolved: 1,
      resolutionRate: 0.2,
      // Known outcomes: three on-time responses, and the stale report's missed
      // 48 h target. The untouched new report is still in time, so not counted.
      respondedOnTimeRate: 0.75,
      // Due: the fixed one (on time) and the stale one (past 168 h).
      resolvedOnTimeRate: 0.5,
    });
    expect(card.medianResponseHours).toBeLessThan(1);
    expect(card.overdue).toHaveLength(1);
    expect(card.overdue[0]).toMatchObject({
      reportId: stale,
      title: 'Blocked drain, ignored',
      severity: 'high',
      status: 'ASSIGNED',
    });
    // 10 days = 240 h, target 168 h: about 72 h over.
    expect(card.overdue[0].hoursOverdue).toBeGreaterThan(71);
    expect(card.overdue[0].hoursOverdue).toBeLessThan(73);

    const other = res.body.data.departments.find(
      (d: { departmentId: string }) => d.departmentId === otherDepartmentId,
    );
    expect(other).toMatchObject({ assigned: 1, resolved: 0, respondedOnTimeRate: null });
  });
});

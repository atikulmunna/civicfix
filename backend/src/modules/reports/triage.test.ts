/**
 * Explainable triage (F1) through the API: scores, the priority sort, the
 * inputs that move a score (votes, severity, status, reporter trust), the
 * admin explanation, and the deploy-time recompute.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { deleteStoredImages } from '../../lib/uploads.js';
import { dayNumber } from './priority.js';
import { recomputeAll, type PriorityExplanation } from './triage.service.js';

const app = buildApp();
const stamp = Date.now();
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWPgL8sDAAGLAPRp2A2cAAAAAElFTkSuQmCC',
  'base64',
);
const emails = {
  admin: `tri_admin_${stamp}@example.com`,
  reporter: `tri_reporter_${stamp}@example.com`,
  voter1: `tri_voter1_${stamp}@example.com`,
  voter2: `tri_voter2_${stamp}@example.com`,
};
const tokens: Record<keyof typeof emails, string> = {
  admin: '',
  reporter: '',
  voter1: '',
  voter2: '',
};
let categoryId = '';
let low = '';
let urgent = '';
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

async function createReport(severity: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/reports')
    .set(...bearer(tokens.reporter))
    .field('title', `Triage ${severity} report`)
    .field('description', 'A report used to check how triage ranks it.')
    .field('categoryId', categoryId)
    .field('severity', severity)
    .field('latitude', '23.76')
    .field('longitude', '90.41')
    .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  storedUrls.push(res.body.data.report.images[0].imageUrl);
  return res.body.data.report.id;
}

async function scoreOf(id: string): Promise<number> {
  const res = await request(app).get(`/api/v1/reports/${id}`);
  return res.body.data.report.priorityScore;
}

/** Points plus the days the report has been open (normally 0 in a test run). */
async function withAge(points: number, id: string): Promise<number> {
  const { createdAt } = await prisma.report.findUniqueOrThrow({ where: { id } });
  return points + dayNumber(new Date()) - dayNumber(createdAt);
}

async function setStatus(id: string, status: string, extra: object = {}) {
  const res = await request(app)
    .patch(`/api/v1/admin/reports/${id}/status`)
    .set(...bearer(tokens.admin))
    .send({ status, ...extra });
  expect(res.status).toBe(200);
}

const priorityOrder = async () => {
  const res = await request(app)
    .get('/api/v1/reports')
    .query({ categoryId, sort: 'priority', limit: 10 });
  return res.body.data.items.map((r: { id: string }) => r.id);
};

const reporterTrust = async () =>
  (await prisma.user.findUniqueOrThrow({ where: { email: emails.reporter } })).trustScore;

beforeAll(async () => {
  categoryId = (await prisma.category.create({ data: { name: `Triage ${stamp}` } })).id;
  for (const key of Object.keys(emails) as (keyof typeof emails)[]) {
    tokens[key] = await registerAndLogin(emails[key]);
  }
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  tokens.admin = await registerAndLogin(emails.admin);
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.report.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await deleteStoredImages(storedUrls.map((u) => path.basename(u)));
  await prisma.$disconnect();
});

describe('explainable triage (F1)', () => {
  it('ranks a new report by its severity', async () => {
    low = await createReport('low');
    urgent = await createReport('urgent');
    expect(await scoreOf(low)).toBe(await withAge(10, low));
    expect(await scoreOf(urgent)).toBe(await withAge(50, urgent));
  });

  it('sorts by priority, highest first', async () => {
    expect(await priorityOrder()).toEqual([urgent, low]);
  });

  it('adds 2 per confirmation and takes 5 per false-report flag', async () => {
    const before = await scoreOf(low);
    await request(app)
      .post(`/api/v1/reports/${low}/confirm`)
      .set(...bearer(tokens.voter1));
    expect(await scoreOf(low)).toBe(before + 2);
    await request(app)
      .post(`/api/v1/reports/${low}/false-report`)
      .set(...bearer(tokens.voter2));
    expect(await scoreOf(low)).toBe(before + 2 - 5);
    await request(app)
      .delete(`/api/v1/reports/${low}/confirm`)
      .set(...bearer(tokens.voter1));
    expect(await scoreOf(low)).toBe(before - 5);
  });

  it('explains the score to admins, and only to admins', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/reports/${low}/priority`)
      .set(...bearer(tokens.admin));
    expect(res.status).toBe(200);
    const priority: PriorityExplanation = res.body.data.priority;
    expect(priority).toMatchObject({
      severity: 10,
      confirmations: 0,
      flags: -5,
      reporter: 0,
      inputs: { severity: 'low', confirms: 0, falseReports: 1, reporterTrust: 0 },
    });
    expect(priority.total).toBe(await scoreOf(low));
    expect(
      priority.severity +
        priority.confirmations +
        priority.waiting +
        priority.flags +
        priority.reporter,
    ).toBe(priority.total);

    const citizen = await request(app)
      .get(`/api/v1/admin/reports/${low}/priority`)
      .set(...bearer(tokens.reporter));
    expect(citizen.status).toBe(403);
    const missing = await request(app)
      .get(`/api/v1/admin/reports/${randomUUID()}/priority`)
      .set(...bearer(tokens.admin));
    expect(missing.status).toBe(404);
  });

  it('re-ranks a report when its severity is edited', async () => {
    const before = await scoreOf(low);
    const res = await request(app)
      .patch(`/api/v1/reports/${low}`)
      .set(...bearer(tokens.reporter))
      .send({ severity: 'high' });
    expect(res.status).toBe(200);
    expect(await scoreOf(low)).toBe(before - 10 + 35);
  });

  it("unranks a rejected report and lowers its reporter's trust", async () => {
    const before = await scoreOf(low);
    await setStatus(urgent, 'REJECTED', { internalNote: 'Not a real issue.' });

    expect(await scoreOf(urgent)).toBe(0);
    expect(await reporterTrust()).toBe(-10);
    // Trust -10 is -2 points on the reporter's other open reports.
    expect(await scoreOf(low)).toBe(before - 2);
    // Closed reports come after every open one.
    expect(await priorityOrder()).toEqual([low, urgent]);

    const closed = await request(app)
      .get(`/api/v1/admin/reports/${urgent}/priority`)
      .set(...bearer(tokens.admin));
    expect(closed.body.data.priority).toBeNull();
  });

  it("raises the reporter's trust when a report is verified", async () => {
    const before = await scoreOf(low);
    await setStatus(low, 'UNDER_REVIEW');
    await setStatus(low, 'VERIFIED');
    // +5 for an upheld report: trust -10 + 5 = -5, i.e. -1 point instead of -2.
    expect(await reporterTrust()).toBe(-5);
    expect(await scoreOf(low)).toBe(before + 1);
  });

  it('recomputes trust and anchors from scratch on deploy', async () => {
    const score = await scoreOf(low);
    await prisma.report.update({ where: { id: low }, data: { priorityAnchor: 0 } });
    await prisma.user.update({ where: { email: emails.reporter }, data: { trustScore: 0 } });

    await recomputeAll(prisma);

    expect(await reporterTrust()).toBe(-5);
    expect(await scoreOf(low)).toBe(score);
  });
});

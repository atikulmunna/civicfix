/**
 * Fix checks (F3) integration tests: real app + Postgres. Residents confirm
 * or dispute a resolved report's fix with a photo; two disputes reopen it,
 * and the next fix is checked afresh.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { LocalStore, objectStore } from '../../lib/storage.js';
import { deleteStoredImages } from '../../lib/uploads.js';

const app = buildApp();
const stamp = Date.now();

// A real, fully decodable 1x1 PNG (uploads are re-encoded).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWPgL8sDAAGLAPRp2A2cAAAAAElFTkSuQmCC',
  'base64',
);
const POINT = { lat: 23.77, lng: 90.42 };

const emails = {
  admin: `fc_admin_${stamp}@example.com`,
  worker: `fc_worker_${stamp}@example.com`,
  otherWorker: `fc_other_${stamp}@example.com`,
  reporter: `fc_reporter_${stamp}@example.com`,
  first: `fc_first_${stamp}@example.com`,
  second: `fc_second_${stamp}@example.com`,
};
type Who = keyof typeof emails;

let categoryId = '';
let deptA = '';
let deptB = '';
const tokens = {} as Record<Who, string>;
const storedUrls: string[] = [];

const bearer = (who: Who) => ['Authorization', `Bearer ${tokens[who]}`] as const;

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'CorrectHorse9' });
  const cookies = res.headers['set-cookie'] as unknown as string[];
  return cookies
    .find((c) => c.startsWith('access_token='))!
    .split(';')[0]!
    .split('=')[1]!;
}

async function userId(who: Who): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { email: emails[who] } })).id;
}

async function submittedReport(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/reports')
    .set(...bearer('reporter'))
    .field('title', 'Collapsed drain cover')
    .field('description', 'The drain cover outside the market has collapsed into the drain.')
    .field('categoryId', categoryId)
    .field('severity', 'high')
    .field('latitude', String(POINT.lat))
    .field('longitude', String(POINT.lng))
    .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  storedUrls.push(res.body.data.report.images[0].imageUrl);
  return res.body.data.report.id;
}

async function staff(who: Who, method: 'patch' | 'post', id: string, action: string, body = {}) {
  const res = await request(app)
    [method](`/api/v1/admin/reports/${id}/${action}`)
    .set(...bearer(who))
    .send(body);
  expect(res.status).toBe(200);
  return res;
}

/** A report taken through to RESOLVED by department A. */
async function resolvedReport(): Promise<string> {
  const id = await submittedReport();
  await staff('admin', 'patch', id, 'status', { status: 'UNDER_REVIEW' });
  await staff('admin', 'patch', id, 'status', { status: 'VERIFIED' });
  await staff('admin', 'patch', id, 'assign', { departmentId: deptA });
  await staff('worker', 'patch', id, 'status', { status: 'IN_PROGRESS' });
  await staff('worker', 'post', id, 'resolve', { note: 'Cover replaced.' });
  return id;
}

async function check(who: Who, id: string, verdict: string, photo: Buffer | null = PNG) {
  const req = request(app)
    .post(`/api/v1/reports/${id}/fix-checks`)
    .set(...bearer(who))
    .field('verdict', verdict);
  if (photo) req.attach('photo', photo, { filename: 'now.png', contentType: 'image/png' });
  const res = await req;
  if (res.status === 201) storedUrls.push(res.body.data.fixCheck.imageUrl);
  return res;
}

async function checks(id: string, who?: Who) {
  const req = request(app).get(`/api/v1/reports/${id}/fix-checks`);
  if (who) req.set(...bearer(who));
  const res = await req;
  expect(res.status).toBe(200);
  return res.body.data;
}

beforeAll(async () => {
  categoryId = (await prisma.category.create({ data: { name: `Drains ${stamp}`, icon: 'drain' } }))
    .id;
  deptA = (await prisma.department.create({ data: { name: `Drainage ${stamp}` } })).id;
  deptB = (await prisma.department.create({ data: { name: `Parks ${stamp}` } })).id;

  for (const email of Object.values(emails)) {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: email.split('_')[1], email, password: 'CorrectHorse9' });
  }
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  await prisma.user.update({
    where: { email: emails.worker },
    data: { role: 'department_worker', departmentId: deptA },
  });
  await prisma.user.update({
    where: { email: emails.otherWorker },
    data: { role: 'department_worker', departmentId: deptB },
  });
  // Log in after the role changes: the token carries the role.
  for (const who of Object.keys(emails) as Who[]) tokens[who] = await login(emails[who]);
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  // Reports cascade to their images, checks, history and notifications.
  await prisma.report.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: { in: [deptA, deptB] } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await deleteStoredImages(storedUrls.map((u) => path.basename(u)));
  await prisma.$disconnect();
});

describe('GET /reports/:id/fix-checks', () => {
  it('shows a fresh fix with an empty tally, and who may check it', async () => {
    const id = await resolvedReport();
    const anon = await checks(id);
    expect(anon).toMatchObject({
      disputesToReopen: 2,
      current: { confirmed: 0, disputed: 0 },
      checks: [],
      total: 0,
    });
    expect(anon.current.resolvedAt).toEqual(expect.any(String));
    expect(anon.viewer).toBeUndefined();

    const may = async (who: Who) => (await checks(id, who)).viewer;
    expect(await may('first')).toEqual({ verdict: null, canCheck: true });
    expect(await may('reporter')).toEqual({ verdict: null, canCheck: true });
    expect(await may('otherWorker')).toEqual({ verdict: null, canCheck: true });
    expect(await may('worker')).toEqual({ verdict: null, canCheck: false });
    expect(await may('admin')).toEqual({ verdict: null, canCheck: false });
  });

  it('has no current fix before the report is resolved', async () => {
    const id = await submittedReport();
    const data = await checks(id, 'first');
    expect(data.current).toBeNull();
    expect(data.viewer).toEqual({ verdict: null, canCheck: false });
  });

  it('is 404 for an unknown report', async () => {
    const res = await request(app).get(
      '/api/v1/reports/00000000-0000-4000-8000-000000000000/fix-checks',
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /reports/:id/fix-checks', () => {
  it('needs a signed-in user, a verdict and a real photo', async () => {
    const id = await resolvedReport();
    const anon = await request(app)
      .post(`/api/v1/reports/${id}/fix-checks`)
      .field('verdict', 'confirmed')
      .attach('photo', PNG, { filename: 'now.png', contentType: 'image/png' });
    expect(anon.status).toBe(401);

    const noPhoto = await check('first', id, 'confirmed', null);
    expect(noPhoto.status).toBe(400);
    expect(noPhoto.body.message).toBe('Add a photo of how it looks now.');

    expect((await check('first', id, 'maybe')).status).toBe(400);

    const notImage = await check('first', id, 'confirmed', Buffer.from('not an image at all'));
    expect(notImage.status).toBe(400);
    expect(notImage.body.code).toBe('VALIDATION_ERROR');

    expect((await checks(id)).total).toBe(0);
  });

  it('only checks a resolved report', async () => {
    const id = await submittedReport();
    const res = await check('first', id, 'confirmed');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Only a resolved report has a fix to check.');
  });

  it('keeps admins and the department that made the fix out', async () => {
    const id = await resolvedReport();
    expect((await check('admin', id, 'confirmed')).status).toBe(403);
    expect((await check('worker', id, 'confirmed')).status).toBe(403);
    // Staff of another department are residents here.
    expect((await check('otherWorker', id, 'confirmed')).status).toBe(201);
  });

  it('records a confirmation with its photo, once per resident', async () => {
    const id = await resolvedReport();
    const res = await check('first', id, 'confirmed');
    expect(res.status).toBe(201);
    expect(res.body.data.reopened).toBe(false);
    expect(res.body.data.fixCheck).toMatchObject({
      verdict: 'confirmed',
      author: { id: await userId('first'), name: 'first' },
    });
    expect(res.body.data.fixCheck.imageUrl).toMatch(/^\/uploads\/.+\.webp$/);

    const again = await check('first', id, 'disputed');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('DUPLICATE_RESOURCE');

    const data = await checks(id, 'first');
    expect(data.current).toMatchObject({ confirmed: 1, disputed: 0 });
    expect(data.checks.map((c: { id: string }) => c.id)).toEqual([res.body.data.fixCheck.id]);
    expect(data.viewer).toEqual({ verdict: 'confirmed', canCheck: false });

    // The check photo is shown with the check, not as a photo of the problem.
    const report = (await request(app).get(`/api/v1/reports/${id}`)).body.data.report;
    expect(report.status).toBe('RESOLVED');
    expect(report.images.map((i: { imageType: string }) => i.imageType)).toEqual(['evidence']);
  });

  it('reopens on the second dispute, and the next fix is checked afresh', async () => {
    const id = await resolvedReport();
    const one = await check('first', id, 'disputed');
    expect(one.body.data.reopened).toBe(false);
    const two = await check('second', id, 'disputed');
    expect(two.status).toBe(201);
    expect(two.body.data.reopened).toBe(true);

    const report = (await request(app).get(`/api/v1/reports/${id}`)).body.data.report;
    expect(report.status).toBe('IN_PROGRESS');
    expect(report.resolvedAt).toBeNull();

    const history = (await request(app).get(`/api/v1/reports/${id}/history`)).body.data.history;
    expect(history.at(-1)).toMatchObject({
      oldStatus: 'RESOLVED',
      newStatus: 'IN_PROGRESS',
      note: 'Reopened: 2 residents disputed the fix with photos.',
      changedBy: { id: await userId('second') },
    });

    // The department hears why; the reporter (a subscriber) hears the change.
    const told = await prisma.notification.findMany({
      where: { reportId: id, userId: await userId('worker') },
    });
    expect(told.map((n) => n.title)).toEqual(['Fix disputed']);
    const reporterNews = await prisma.notification.findMany({
      where: { reportId: id, userId: await userId('reporter') },
      orderBy: { createdAt: 'asc' },
    });
    expect(reporterNews.at(-1)?.message).toMatch(/is now in progress/);

    const reopened = await checks(id, 'first');
    expect(reopened.current).toBeNull();
    expect(reopened.total).toBe(2);
    expect(reopened.viewer).toEqual({ verdict: null, canCheck: false });

    // The department fixes it again: a new fix, with its own checks.
    await staff('worker', 'post', id, 'resolve', { note: 'Cover replaced properly.' });
    const fresh = await checks(id, 'first');
    expect(fresh.current).toMatchObject({ confirmed: 0, disputed: 0 });
    expect(fresh.viewer).toEqual({ verdict: null, canCheck: true });
    expect((await check('first', id, 'confirmed')).status).toBe(201);
    const after = await checks(id);
    expect(after.total).toBe(3);
    expect(after.current).toMatchObject({ confirmed: 1, disputed: 0 });
  });

  it('counts two disputes sent at the same moment', async () => {
    const id = await resolvedReport();
    const results = await Promise.all([
      check('first', id, 'disputed'),
      check('second', id, 'disputed'),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results.filter((r) => r.body.data.reopened)).toHaveLength(1);
    const report = (await request(app).get(`/api/v1/reports/${id}`)).body.data.report;
    expect(report.status).toBe('IN_PROGRESS');
  });

  it('removes the check photos from storage with the report', async () => {
    if (!(objectStore instanceof LocalStore)) throw new Error('tests expect local storage');
    const id = await resolvedReport();
    const res = await check('first', id, 'confirmed');
    const file = path.join(objectStore.dir, path.basename(res.body.data.fixCheck.imageUrl));
    expect(existsSync(file)).toBe(true);

    const del = await request(app)
      .delete(`/api/v1/reports/${id}`)
      .set(...bearer('admin'));
    expect(del.status).toBe(200);
    expect(existsSync(file)).toBe(false);
  });
});

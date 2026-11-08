/**
 * Duplicate merging (F4, part 2) integration tests: real app + PostGIS.
 * Admins see likely duplicates of a report and merge one into its original,
 * which moves the duplicate's reporter and followers to the original.
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
/** About 111 m per thousandth of a degree north. */
const BASE = { lat: 22.9, lng: 91.5 };
const north = (metres: number) => ({ lat: BASE.lat + metres / 111_000, lng: BASE.lng });

const emails = {
  admin: `dm_admin_${stamp}@example.com`,
  first: `dm_first_${stamp}@example.com`,
  second: `dm_second_${stamp}@example.com`,
  follower: `dm_follower_${stamp}@example.com`,
};
type Who = keyof typeof emails;
const tokens = {} as Record<Who, string>;
let lights = '';
let roads = '';
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

const userId = async (who: Who) =>
  (await prisma.user.findUniqueOrThrow({ where: { email: emails[who] } })).id;

async function report(
  who: Who,
  title: string,
  at: { lat: number; lng: number },
  categoryId = lights,
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/reports')
    .set(...bearer(who))
    .field('title', title)
    .field('description', 'The street light on this stretch has stopped working at night.')
    .field('categoryId', categoryId)
    .field('severity', 'medium')
    .field('latitude', String(at.lat))
    .field('longitude', String(at.lng))
    .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  storedUrls.push(res.body.data.report.images[0].imageUrl);
  return res.body.data.report.id;
}

const merge = (duplicate: string, original: string) =>
  request(app)
    .post(`/api/v1/admin/reports/${duplicate}/duplicate`)
    .set(...bearer('admin'))
    .send({ duplicateOfReportId: original });

const candidates = (id: string, who: Who = 'admin') =>
  request(app)
    .get(`/api/v1/admin/reports/${id}/duplicate-candidates`)
    .set(...bearer(who));

beforeAll(async () => {
  lights = (await prisma.category.create({ data: { name: `Lamps ${stamp}`, icon: 'light' } })).id;
  roads = (await prisma.category.create({ data: { name: `Lanes ${stamp}`, icon: 'road' } })).id;
  for (const email of Object.values(emails)) {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: email.split('_')[1], email, password: 'CorrectHorse9' });
  }
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  for (const who of Object.keys(emails) as Who[]) tokens[who] = await login(emails[who]);
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  // Duplicates point at their originals: clear that before deleting reports.
  await prisma.report.updateMany({
    where: { userId: { in: ids } },
    data: { duplicateOfReportId: null },
  });
  await prisma.report.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.category.deleteMany({ where: { id: { in: [lights, roads] } } });
  await deleteStoredImages(storedUrls.map((u) => path.basename(u)));
  await prisma.$disconnect();
});

describe('GET /admin/reports/:id/duplicate-candidates', () => {
  it('lists older open reports of the same kind nearby, nearest first', async () => {
    const far = await report('first', 'Lamp out by the mosque', north(150));
    const near = await report('first', 'Dark stretch of the lane', north(50));
    const tooFar = await report('first', 'Lamp out by the school', north(300));
    const otherKind = await report('first', 'Pothole by the lamp', north(20), roads);
    const fixed = await report('first', 'Lamp flickering', north(40));
    await prisma.report.update({ where: { id: fixed }, data: { status: 'RESOLVED' } });
    const rejected = await report('first', 'Lamp complaint', north(30));
    await prisma.report.update({ where: { id: rejected }, data: { status: 'REJECTED' } });

    const subject = await report('second', 'Street light not working', BASE);
    // Reported after the subject: the subject would be its original, not the other way round.
    const newer = await report('first', 'No light here either', north(10));

    const res = await candidates(subject);
    expect(res.status).toBe(200);
    expect(res.body.data.radiusM).toBe(200);
    const listed = res.body.data.candidates as { id: string; distanceM: number }[];
    expect(listed.map((c) => c.id)).toEqual([near, far]);
    expect(listed[0]?.distanceM).toBeGreaterThan(45);
    expect(listed[0]?.distanceM).toBeLessThan(55);
    for (const left of [tooFar, otherKind, fixed, rejected, newer, subject]) {
      expect(listed.map((c) => c.id)).not.toContain(left);
    }
  });

  it('is for admins only', async () => {
    const id = await report('first', 'Lamp out on the corner', north(500));
    expect((await candidates(id, 'first')).status).toBe(403);
    const anon = await request(app).get(`/api/v1/admin/reports/${id}/duplicate-candidates`);
    expect(anon.status).toBe(401);
  });

  it('is 404 for an unknown report', async () => {
    const res = await candidates('00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('merging a duplicate into its original', () => {
  it('moves the reporter and followers to the original, and tells them where it went', async () => {
    const original = await report('first', 'Lamp post dark all week', north(700));
    const duplicate = await report('second', 'Light broken near the bridge', north(720));
    // The original's reporter follows the duplicate too: they must keep their own follow.
    for (const who of ['follower', 'first'] as const) {
      const follow = await request(app)
        .post(`/api/v1/reports/${duplicate}/follow`)
        .set(...bearer(who));
      expect(follow.status).toBe(200);
    }

    const res = await merge(duplicate, original);
    expect(res.status).toBe(200);
    expect(res.body.data.report).toMatchObject({
      status: 'DUPLICATE',
      duplicateOfReportId: original,
    });

    const subs = await prisma.reportSubscription.findMany({
      where: { reportId: original },
      select: { userId: true, source: true },
    });
    const sourceOf = new Map(subs.map((s) => [s.userId, s.source]));
    expect(sourceOf.get(await userId('first'))).toBe('owner');
    expect(sourceOf.get(await userId('second'))).toBe('explicit');
    expect(sourceOf.get(await userId('follower'))).toBe('explicit');

    for (const who of ['second', 'follower'] as const) {
      const told = await prisma.notification.findFirstOrThrow({
        where: { reportId: duplicate, userId: await userId(who) },
        orderBy: { createdAt: 'desc' },
      });
      expect(told.message).toBe(
        'Your report "Light broken near the bridge" was merged into "Lamp post dark all week", ' +
          'which reports the same problem. You will get its updates from now on.',
      );
    }

    const history = (await request(app).get(`/api/v1/reports/${duplicate}/history`)).body.data
      .history;
    expect(history.at(-1).note).toBe('Merged into "Lamp post dark all week".');

    // They do get the original's updates now.
    const review = await request(app)
      .patch(`/api/v1/admin/reports/${original}/status`)
      .set(...bearer('admin'))
      .send({ status: 'UNDER_REVIEW' });
    expect(review.status).toBe(200);
    const update = await prisma.notification.findFirst({
      where: { reportId: original, userId: await userId('second') },
    });
    expect(update?.message).toMatch(/is now under review/);

    // And can stop, like any follow.
    const unfollow = await request(app)
      .delete(`/api/v1/reports/${original}/follow`)
      .set(...bearer('second'));
    expect(unfollow.body.data).toEqual({ following: false });
  });

  it("keeps the admin's own note when one is given", async () => {
    const original = await report('first', 'Lamp out at the gate', north(900));
    const duplicate = await report('second', 'Gate lamp out', north(910));
    const res = await request(app)
      .post(`/api/v1/admin/reports/${duplicate}/duplicate`)
      .set(...bearer('admin'))
      .send({ duplicateOfReportId: original, note: 'Same lamp, reported twice.' });
    expect(res.status).toBe(200);
    const history = (await request(app).get(`/api/v1/reports/${duplicate}/history`)).body.data
      .history;
    expect(history.at(-1).note).toBe('Same lamp, reported twice.');
  });

  it('only merges into an open report', async () => {
    const duplicate = await report('second', 'Lamp out again', north(1100));

    const fixed = await report('first', 'Lamp out, fixed', north(1110));
    await prisma.report.update({ where: { id: fixed }, data: { status: 'RESOLVED' } });
    const intoFixed = await merge(duplicate, fixed);
    expect(intoFixed.status).toBe(400);
    expect(intoFixed.body.message).toBe(
      'Merge into an open report: this one is already resolved. A problem reported again after a fix is not a duplicate.',
    );

    const other = await report('first', 'Lamp out, merged', north(1120));
    const target = await report('first', 'Lamp out, original', north(1130));
    expect((await merge(other, target)).status).toBe(200);
    const intoDuplicate = await merge(duplicate, other);
    expect(intoDuplicate.status).toBe(400);
    expect(intoDuplicate.body.message).toBe(
      'Merge into an open report: this one is already a duplicate.',
    );

    // Nothing changed: the report is still waiting for review.
    const after = (await request(app).get(`/api/v1/reports/${duplicate}`)).body.data.report;
    expect(after.status).toBe('SUBMITTED');
  });

  it('is 404 for an unknown original', async () => {
    const duplicate = await report('second', 'Lamp out by the stall', north(1300));
    const res = await merge(duplicate, '00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('The original report was not found.');
  });
});

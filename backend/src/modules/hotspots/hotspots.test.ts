/**
 * Hotspots and recurrence (F4) integration tests: real app + PostGIS.
 *
 * Hotspots are computed across every report in the database, so each case
 * builds its own cluster at its own spot (Chattogram, far from where other
 * suites and the seed put reports) and looks for its own report ids.
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

/** One spot per case, about 2 km apart. 0.0008 degrees is about 89 m north-south. */
const spot = (n: number) => ({ lat: 22.3 + n * 0.02, lng: 91.8 });
const STEP = 0.0008;

const emails = {
  admin: `hs_admin_${stamp}@example.com`,
  citizen: `hs_citizen_${stamp}@example.com`,
};
let adminToken = '';
let citizenToken = '';
let roads = '';
let water = '';
let deptId = '';
const storedUrls: string[] = [];

interface HotspotBody {
  reportCount: number;
  openCount: number;
  radiusM: number;
  latitude: number;
  recurring: boolean;
  categories: { categoryId: string; name: string; count: number }[];
  reports: { id: string }[];
}

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

async function report(at: { lat: number; lng: number }, categoryId = roads): Promise<string> {
  const res = await request(app)
    .post('/api/v1/reports')
    .set('Authorization', `Bearer ${citizenToken}`)
    .field('title', 'Broken kerb by the market')
    .field('description', 'The kerb stones have come loose along the market road.')
    .field('categoryId', categoryId)
    .field('severity', 'medium')
    .field('latitude', String(at.lat))
    .field('longitude', String(at.lng))
    .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  storedUrls.push(res.body.data.report.images[0].imageUrl);
  return res.body.data.report.id;
}

async function admin(method: 'patch' | 'post', id: string, action: string, body: object) {
  const res = await request(app)
    [method](`/api/v1/admin/reports/${id}/${action}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
  expect(res.status).toBe(200);
}

async function resolve(id: string): Promise<void> {
  await admin('patch', id, 'status', { status: 'UNDER_REVIEW' });
  await admin('patch', id, 'status', { status: 'VERIFIED' });
  await admin('patch', id, 'assign', { departmentId: deptId });
  await admin('patch', id, 'status', { status: 'IN_PROGRESS' });
  await admin('post', id, 'resolve', { note: 'Kerb reset.' });
}

/** The hotspot holding any of these reports, if one does. */
async function hotspotOf(ids: string[]): Promise<HotspotBody | undefined> {
  const res = await request(app).get('/api/v1/hotspots');
  expect(res.status).toBe(200);
  const hotspots = res.body.data.hotspots as HotspotBody[];
  return hotspots.find((h) => h.reports.some((r) => ids.includes(r.id)));
}

beforeAll(async () => {
  roads = (await prisma.category.create({ data: { name: `Kerbs ${stamp}`, icon: 'road' } })).id;
  water = (await prisma.category.create({ data: { name: `Mains ${stamp}`, icon: 'water' } })).id;
  deptId = (await prisma.department.create({ data: { name: `Highways ${stamp}` } })).id;
  for (const email of Object.values(emails)) {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'User', email, password: 'CorrectHorse9' });
  }
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  adminToken = await login(emails.admin);
  citizenToken = await login(emails.citizen);
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.report.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.department.deleteMany({ where: { id: deptId } });
  await prisma.category.deleteMany({ where: { id: { in: [roads, water] } } });
  await deleteStoredImages(storedUrls.map((u) => path.basename(u)));
  await prisma.$disconnect();
});

describe('GET /hotspots', () => {
  it('finds a place with three reports close together, for anyone', async () => {
    const at = spot(0);
    const ids = [
      await report(at),
      await report({ lat: at.lat + STEP, lng: at.lng }),
      await report({ lat: at.lat + 2 * STEP, lng: at.lng }),
    ];
    const res = await request(app).get('/api/v1/hotspots');
    expect(res.body.data).toMatchObject({ windowDays: 90, radiusM: 150, minReports: 3 });

    const hotspot = await hotspotOf(ids);
    expect(hotspot).toMatchObject({ reportCount: 3, openCount: 3, recurring: false });
    expect(hotspot?.reports.map((r) => r.id).sort()).toEqual([...ids].sort());
    expect(hotspot?.categories).toEqual([{ categoryId: roads, name: `Kerbs ${stamp}`, count: 3 }]);
    expect(hotspot?.latitude).toBeCloseTo(at.lat + STEP, 5);
    // The middle report is the centre; the outer two are about 89 m away.
    expect(hotspot?.radiusM).toBeGreaterThan(85);
    expect(hotspot?.radiusM).toBeLessThan(95);
  });

  it('measures reach in metres on the ground at this latitude', async () => {
    // Web Mercator stretches distances here by about 8%, so these 145 m gaps
    // would look like 157 m, past the 150 m radius, if left uncorrected.
    const near = spot(6);
    const nearIds = [
      await report(near),
      await report({ lat: near.lat + 0.0013, lng: near.lng }),
      await report({ lat: near.lat + 0.0026, lng: near.lng }),
    ];
    expect((await hotspotOf(nearIds))?.reportCount).toBe(3);

    // 160 m gaps are past the radius however they are measured.
    const far = spot(7);
    const farIds = [
      await report(far),
      await report({ lat: far.lat + 0.00144, lng: far.lng }),
      await report({ lat: far.lat + 0.00288, lng: far.lng }),
    ];
    expect(await hotspotOf(farIds)).toBeUndefined();
  });

  it('needs three reports within reach of one another', async () => {
    const at = spot(1);
    const ids = [
      await report(at),
      await report({ lat: at.lat + STEP, lng: at.lng }),
      // About 450 m from the others: too far to join them.
      await report({ lat: at.lat + 6 * STEP, lng: at.lng }),
    ];
    expect(await hotspotOf(ids)).toBeUndefined();
  });

  it('leaves out rejected reports and duplicates', async () => {
    const at = spot(2);
    const ids = [
      await report(at),
      await report({ lat: at.lat + STEP, lng: at.lng }),
      await report({ lat: at.lat, lng: at.lng + STEP }),
      await report({ lat: at.lat + STEP, lng: at.lng + STEP }),
    ];
    const [first, second, third] = ids as [string, string, string, string];
    expect((await hotspotOf(ids))?.reportCount).toBe(4);

    await admin('patch', second, 'status', {
      status: 'REJECTED',
      internalNote: 'Not a public kerb.',
    });
    expect((await hotspotOf(ids))?.reportCount).toBe(3);

    await admin('post', third, 'duplicate', { duplicateOfReportId: first });
    expect(await hotspotOf(ids)).toBeUndefined();
  });

  it('counts only the last 90 days', async () => {
    const at = spot(3);
    const ids = [
      await report(at),
      await report({ lat: at.lat + STEP, lng: at.lng }),
      await report({ lat: at.lat + 2 * STEP, lng: at.lng }),
    ];
    expect((await hotspotOf(ids))?.reportCount).toBe(3);
    await prisma.report.update({
      where: { id: ids[0]! },
      data: { createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) },
    });
    expect(await hotspotOf(ids)).toBeUndefined();
  });
});

describe('recurring problems', () => {
  it('flags a place where a fixed problem came back, and names the earlier fix', async () => {
    const at = spot(4);
    const fixed = await report(at);
    await resolve(fixed);
    // Fixed too, but about 450 m away: a different place.
    await resolve(await report({ lat: at.lat + 5 * STEP, lng: at.lng }));
    // Reported after the fix: the same kind of problem, and a different one.
    const again = await report({ lat: at.lat + STEP, lng: at.lng });
    const otherKind = await report({ lat: at.lat, lng: at.lng + STEP }, water);

    const hotspot = await hotspotOf([fixed, again, otherKind]);
    expect(hotspot).toMatchObject({ reportCount: 3, openCount: 2, recurring: true });

    const recurrence = await request(app).get(`/api/v1/reports/${again}/recurrence`);
    expect(recurrence.status).toBe(200);
    expect(recurrence.body.data).toMatchObject({ radiusM: 150, total: 1 });
    expect(recurrence.body.data.earlier).toEqual([
      expect.objectContaining({ id: fixed, status: 'RESOLVED' }),
    ]);
    expect(recurrence.body.data.earlier[0].distanceM).toBeGreaterThan(85);
    expect(recurrence.body.data.earlier[0].distanceM).toBeLessThan(95);

    // A different kind of problem, and the fixed report itself, have no earlier fix.
    for (const id of [otherKind, fixed]) {
      const none = await request(app).get(`/api/v1/reports/${id}/recurrence`);
      expect(none.body.data).toMatchObject({ total: 0, earlier: [] });
    }
  });

  it('does not count a fix that came after the report', async () => {
    const at = spot(5);
    const first = await report(at);
    const second = await report({ lat: at.lat + STEP, lng: at.lng });
    await resolve(first);
    const res = await request(app).get(`/api/v1/reports/${second}/recurrence`);
    expect(res.body.data.total).toBe(0);
  });

  it('is 404 for an unknown report', async () => {
    const res = await request(app).get(
      '/api/v1/reports/00000000-0000-4000-8000-000000000000/recurrence',
    );
    expect(res.status).toBe(404);
  });
});

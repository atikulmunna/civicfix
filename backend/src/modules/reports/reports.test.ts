/**
 * Reports integration tests — real Express app + Docker Postgres/PostGIS.
 * Covers SRS v1.1 §9.4: create (multipart + magic-byte image check), list/
 * filter/paginate, detail (internal-note hiding), owner edit/delete window
 * (REP-012/BR-013), nearby (ST_DWithin), map bbox (MAP-009), duplicates (§6.9).
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

// A real 1x1 PNG (valid magic bytes) for upload tests.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// Dhaka base point and an offset ~5 km away.
const BASE = { lat: 23.8103, lng: 90.4125 };
const FAR = { lat: 23.8553, lng: 90.4125 }; // ~5 km north

const emails = {
  owner: `rep_owner_${stamp}@example.com`,
  other: `rep_other_${stamp}@example.com`,
  admin: `rep_admin_${stamp}@example.com`,
};

let categoryId = '';
let otherCategoryId = '';
let ownerToken = '';
let otherToken = '';
let adminToken = '';
const storedUrls: string[] = [];

async function registerAndLogin(email: string): Promise<string> {
  await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Reporter', email, password: 'CorrectHorse9' });
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'CorrectHorse9' });
  const cookies = login.headers['set-cookie'] as unknown as string[];
  const access = cookies.find((c) => c.startsWith('access_token='))!;
  return access.split(';')[0].split('=')[1];
}

interface CreateOpts {
  token: string;
  lat?: number;
  lng?: number;
  category?: string;
  severity?: string;
  withImage?: boolean;
  title?: string;
}

function createReport(o: CreateOpts) {
  const req = request(app)
    .post('/api/v1/reports')
    .set('Authorization', `Bearer ${o.token}`)
    .field('title', o.title ?? 'Broken streetlight on Main Rd')
    .field('description', 'The streetlight has been out for several days now.')
    .field('categoryId', o.category ?? categoryId)
    .field('severity', o.severity ?? 'medium')
    .field('latitude', String(o.lat ?? BASE.lat))
    .field('longitude', String(o.lng ?? BASE.lng));
  if (o.withImage !== false) {
    req.attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  }
  return req;
}

beforeAll(async () => {
  const cat = await prisma.category.create({
    data: { name: `Streetlights ${stamp}`, icon: 'lightbulb' },
  });
  const cat2 = await prisma.category.create({
    data: { name: `Potholes ${stamp}`, icon: 'road' },
  });
  categoryId = cat.id;
  otherCategoryId = cat2.id;

  ownerToken = await registerAndLogin(emails.owner);
  otherToken = await registerAndLogin(emails.other);
  await registerAndLogin(emails.admin);
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  // Re-login so the access token carries the admin role.
  adminToken = await registerAndLogin(emails.admin);
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.report.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.category.deleteMany({ where: { id: { in: [categoryId, otherCategoryId] } } });
  // Remove files written to disk during the run.
  await Promise.all(
    storedUrls.map((u) => unlink(path.join(uploadDir, path.basename(u))).catch(() => {})),
  );
  await prisma.$disconnect();
});

describe('POST /reports (create)', () => {
  it('requires authentication (BR-001)', async () => {
    const res = await createReport({ token: '' }).set('Authorization', '');
    expect(res.status).toBe(401);
  });

  it('creates a SUBMITTED report with an image and an initial history row', async () => {
    const res = await createReport({ token: ownerToken });
    expect(res.status).toBe(201);
    const report = res.body.data.report;
    expect(report.status).toBe('SUBMITTED');
    expect(report.images).toHaveLength(1);
    expect(report.images[0].imageUrl).toMatch(/^\/uploads\/.+\.png$/);
    storedUrls.push(report.images[0].imageUrl);

    const history = await prisma.statusHistory.findMany({ where: { reportId: report.id } });
    expect(history).toHaveLength(1);
    expect(history[0].oldStatus).toBeNull();
    expect(history[0].newStatus).toBe('SUBMITTED');
  });

  it('rejects creation with no image (REP-003)', async () => {
    const res = await createReport({ token: ownerToken, withImage: false });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-image file by magic bytes, not content-type (SEC-008)', async () => {
    const res = request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('title', 'Spoofed upload attempt')
      .field('description', 'This payload is not really an image at all.')
      .field('categoryId', categoryId)
      .field('severity', 'low')
      .field('latitude', String(BASE.lat))
      .field('longitude', String(BASE.lng))
      .attach('images', Buffer.from('<?php echo 1; ?>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });
    const out = await res;
    expect(out.status).toBe(400);
    expect(out.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown category (REP-004)', async () => {
    const res = await createReport({
      token: ownerToken,
      category: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('sanitizes report title/description on create (SEC-007)', async () => {
    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('title', '<b>Broken</b> sign')
      .field('description', 'Hazard <script>alert(1)</script> at the corner.')
      .field('categoryId', categoryId)
      .field('severity', 'low')
      .field('latitude', String(BASE.lat))
      .field('longitude', String(BASE.lng))
      .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    storedUrls.push(res.body.data.report.images[0].imageUrl);
    expect(res.body.data.report.title).not.toContain('<b>');
    expect(res.body.data.report.title).toContain('&lt;b&gt;');
    expect(res.body.data.report.description).not.toContain('<script>');
  });

  it('rejects a missing required field (validation)', async () => {
    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('description', 'No title provided here, should fail validation.')
      .field('categoryId', categoryId)
      .field('severity', 'low')
      .field('latitude', String(BASE.lat))
      .field('longitude', String(BASE.lng))
      .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
});

describe('GET /reports/:id (detail) + internal note hiding (BR-012)', () => {
  let reportId = '';
  beforeAll(async () => {
    const res = await createReport({ token: ownerToken });
    reportId = res.body.data.report.id;
    storedUrls.push(res.body.data.report.images[0].imageUrl);
    await prisma.report.update({
      where: { id: reportId },
      data: { internalNote: 'admin eyes only' },
    });
  });

  it('hides internalNote from anonymous/citizen viewers', async () => {
    const res = await request(app).get(`/api/v1/reports/${reportId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.report).not.toHaveProperty('internalNote');
  });

  it('reveals internalNote to admins', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/${reportId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.report.internalNote).toBe('admin eyes only');
  });

  it('returns 404 for an unknown report', async () => {
    const res = await request(app).get('/api/v1/reports/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /reports (list, filter, paginate)', () => {
  it('lists reports in the test category with pagination metadata', async () => {
    const res = await request(app).get('/api/v1/reports').query({ categoryId, limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data).toMatchObject({ page: 1, limit: 5 });
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.items.every((r: { categoryId: string }) => r.categoryId === categoryId)).toBe(true);
  });

  it('filters by severity', async () => {
    await createReport({ token: ownerToken, severity: 'urgent', title: 'Urgent gas leak smell' }).then(
      (r) => storedUrls.push(r.body.data.report.images[0].imageUrl),
    );
    const res = await request(app).get('/api/v1/reports').query({ categoryId, severity: 'urgent' });
    expect(res.body.data.items.every((r: { severity: string }) => r.severity === 'urgent')).toBe(true);
  });

  it('searches by title text', async () => {
    const res = await request(app).get('/api/v1/reports').query({ search: 'gas leak' });
    expect(res.body.data.items.some((r: { title: string }) => /gas leak/i.test(r.title))).toBe(true);
  });

  it('sorts by most_confirmed (LIST-005)', async () => {
    // Create a fresh report and give it confirms so it ranks at the top.
    const top = await createReport({ token: ownerToken, title: 'Most confirmed candidate' });
    const topId = top.body.data.report.id;
    storedUrls.push(top.body.data.report.images[0].imageUrl);
    await request(app).post(`/api/v1/reports/${topId}/confirm`).set('Authorization', `Bearer ${ownerToken}`);
    await request(app).post(`/api/v1/reports/${topId}/confirm`).set('Authorization', `Bearer ${otherToken}`);

    const res = await request(app)
      .get('/api/v1/reports')
      .query({ categoryId, sort: 'most_confirmed', limit: 50 });
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ id: string; counts: { confirms: number } }>;
    expect(items[0].id).toBe(topId);
    expect(items[0].counts.confirms).toBe(2);
    // Confirm counts are non-increasing down the list.
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].counts.confirms).toBeGreaterThanOrEqual(items[i].counts.confirms);
    }
  });
});

describe('GET /reports/nearby (ST_DWithin)', () => {
  it('returns reports within radius, nearest first, and excludes far ones', async () => {
    await createReport({ token: ownerToken, ...FAR, title: 'Far away broken bench' }).then((r) =>
      storedUrls.push(r.body.data.report.images[0].imageUrl),
    );
    const res = await request(app)
      .get('/api/v1/reports/nearby')
      .query({ lat: BASE.lat, lng: BASE.lng, radius: 1000 });
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ latitude: number; distanceM: number; title: string }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((r) => r.distanceM <= 1000)).toBe(true);
    expect(items.some((r) => /far away/i.test(r.title))).toBe(false);
  });
});

describe('GET /reports/map (bbox, MAP-009)', () => {
  it('returns only reports inside the bounding box', async () => {
    const bbox = `${BASE.lng - 0.01},${BASE.lat - 0.01},${BASE.lng + 0.01},${BASE.lat + 0.01}`;
    const res = await request(app).get('/api/v1/reports/map').query({ bbox });
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{ latitude: number; longitude: number }>;
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.every(
        (r) =>
          r.latitude >= BASE.lat - 0.01 &&
          r.latitude <= BASE.lat + 0.01 &&
          r.longitude >= BASE.lng - 0.01 &&
          r.longitude <= BASE.lng + 0.01,
      ),
    ).toBe(true);
  });
});

describe('POST /reports/check-duplicates (§6.9)', () => {
  it('finds same-category nearby active reports', async () => {
    const res = await request(app)
      .post('/api/v1/reports/check-duplicates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ categoryId, latitude: BASE.lat, longitude: BASE.lng, radius: 300 });
    expect(res.status).toBe(200);
    expect(res.body.data.possibleDuplicates.length).toBeGreaterThan(0);
  });

  it('returns none for a different category at the same spot', async () => {
    const res = await request(app)
      .post('/api/v1/reports/check-duplicates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ categoryId: otherCategoryId, latitude: BASE.lat, longitude: BASE.lng, radius: 300 });
    expect(res.body.data.possibleDuplicates).toHaveLength(0);
  });
});

describe('PATCH/DELETE /reports/:id (edit window, REP-012/BR-013)', () => {
  async function freshReport(): Promise<string> {
    const res = await createReport({ token: ownerToken });
    storedUrls.push(res.body.data.report.images[0].imageUrl);
    return res.body.data.report.id;
  }

  it('lets the owner edit while SUBMITTED', async () => {
    const id = await freshReport();
    const res = await request(app)
      .patch(`/api/v1/reports/${id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Updated streetlight title' });
    expect(res.status).toBe(200);
    expect(res.body.data.report.title).toBe('Updated streetlight title');
  });

  it('forbids a non-owner from editing (403)', async () => {
    const id = await freshReport();
    const res = await request(app)
      .patch(`/api/v1/reports/${id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hijacked title' });
    expect(res.status).toBe(403);
  });

  it('forbids the owner from editing once past SUBMITTED', async () => {
    const id = await freshReport();
    await prisma.report.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
    const res = await request(app)
      .patch(`/api/v1/reports/${id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Too late to edit' });
    expect(res.status).toBe(403);
  });

  it('lets the owner delete while SUBMITTED', async () => {
    const id = await freshReport();
    const res = await request(app)
      .delete(`/api/v1/reports/${id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const gone = await request(app).get(`/api/v1/reports/${id}`);
    expect(gone.status).toBe(404);
  });

  it('lets an admin delete any report', async () => {
    const id = await freshReport();
    const res = await request(app)
      .delete(`/api/v1/reports/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

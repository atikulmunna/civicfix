/**
 * Notifications integration tests — real app + Postgres.
 * Covers status-change emission to subscribers excluding the actor
 * (NOTIF-001/002/003, §13.5), list + unread count, mark one / mark all read
 * (NOTIF-004), and ownership enforcement.
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
const POINT = { lat: 23.73, lng: 90.4 };
const TITLE = 'Pothole near the bus stop';

const emails = {
  author: `ntf_author_${stamp}@example.com`,
  voter: `ntf_voter_${stamp}@example.com`,
  admin: `ntf_admin_${stamp}@example.com`,
};

let categoryId = '';
let authorToken = '';
let voterToken = '';
let adminToken = '';
let authorId = '';
let voterId = '';
let adminId = '';
let reportId = '';
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
    .set(...bearer(authorToken))
    .field('title', TITLE)
    .field('description', 'Deep pothole that keeps growing after the rain.')
    .field('categoryId', categoryId)
    .field('severity', 'medium')
    .field('latitude', String(POINT.lat))
    .field('longitude', String(POINT.lng))
    .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  storedUrls.push(res.body.data.report.images[0].imageUrl);
  return res.body.data.report.id;
}

async function setStatus(id: string, status: string, token = adminToken) {
  return request(app).patch(`/api/v1/admin/reports/${id}/status`).set(...bearer(token)).send({ status });
}

beforeAll(async () => {
  categoryId = (await prisma.category.create({ data: { name: `Roads N ${stamp}`, icon: 'road' } })).id;
  authorToken = await registerAndLogin(emails.author);
  voterToken = await registerAndLogin(emails.voter);
  await registerAndLogin(emails.admin);
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  adminToken = await registerAndLogin(emails.admin);

  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
    select: { id: true, email: true },
  });
  authorId = users.find((u) => u.email === emails.author)!.id;
  voterId = users.find((u) => u.email === emails.voter)!.id;
  adminId = users.find((u) => u.email === emails.admin)!.id;

  reportId = await createReport();
  // Voter confirms -> becomes a subscriber (BR-016).
  await request(app).post(`/api/v1/reports/${reportId}/confirm`).set(...bearer(voterToken));
});

afterAll(async () => {
  const ids = [authorId, voterId, adminId];
  await prisma.report.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await Promise.all(
    storedUrls.map((u) => unlink(path.join(uploadDir, path.basename(u))).catch(() => {})),
  );
  await prisma.$disconnect();
});

describe('GET /notifications', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

describe('status-change emission (§13.5)', () => {
  it('notifies subscribers (owner + confirmer) but not the acting admin', async () => {
    const res = await setStatus(reportId, 'UNDER_REVIEW');
    expect(res.status).toBe(200);

    const author = await request(app).get('/api/v1/notifications').set(...bearer(authorToken));
    expect(author.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    expect(author.body.data.items[0].message).toContain(TITLE);
    expect(author.body.data.items[0].message).toContain('under review');
    expect(author.body.data.items[0].type).toBe('status_change');

    const voter = await request(app).get('/api/v1/notifications').set(...bearer(voterToken));
    expect(voter.body.data.unreadCount).toBeGreaterThanOrEqual(1);

    // The admin triggered the change and is not a subscriber → no notification.
    const admin = await request(app).get('/api/v1/notifications').set(...bearer(adminToken));
    expect(admin.body.data.total).toBe(0);
  });

  it('excludes the actor even when the actor is a subscriber', async () => {
    const r2 = await createReport();
    await request(app).post(`/api/v1/reports/${r2}/follow`).set(...bearer(adminToken));
    await setStatus(r2, 'UNDER_REVIEW');

    const adminForR2 = await prisma.notification.count({
      where: { userId: adminId, reportId: r2 },
    });
    expect(adminForR2).toBe(0);
    const authorForR2 = await prisma.notification.count({
      where: { userId: authorId, reportId: r2 },
    });
    expect(authorForR2).toBe(1);
  });
});

describe('mark read (NOTIF-004)', () => {
  it('marks a single notification read, lowering the unread count', async () => {
    const list = await request(app).get('/api/v1/notifications').set(...bearer(authorToken));
    const before = list.body.data.unreadCount;
    const id = list.body.data.items.find((n: { isRead: boolean }) => !n.isRead).id;

    const res = await request(app).patch(`/api/v1/notifications/${id}/read`).set(...bearer(authorToken));
    expect(res.status).toBe(200);

    const after = await request(app)
      .get('/api/v1/notifications')
      .set(...bearer(authorToken))
      .query({ unreadOnly: 'true' });
    expect(after.body.data.unreadCount).toBe(before - 1);
    expect(after.body.data.items.every((n: { isRead: boolean }) => !n.isRead)).toBe(true);
  });

  it('returns 404 marking another user\'s notification', async () => {
    const voterNote = await prisma.notification.findFirst({ where: { userId: voterId } });
    const res = await request(app)
      .patch(`/api/v1/notifications/${voterNote!.id}/read`)
      .set(...bearer(authorToken));
    expect(res.status).toBe(404);
  });

  it('marks all read', async () => {
    await setStatus(reportId, 'VERIFIED'); // new unread for author
    const res = await request(app).patch('/api/v1/notifications/read-all').set(...bearer(authorToken));
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBeGreaterThanOrEqual(1);

    const after = await request(app).get('/api/v1/notifications').set(...bearer(authorToken));
    expect(after.body.data.unreadCount).toBe(0);
  });
});

/**
 * Community integration tests — real Express app + Docker Postgres.
 * Covers comments (COM-*), votes (VOTE-*, BR-006/007), confirm auto-follow
 * (BR-016), follow/unfollow (NOTIF-007), and vote-count wiring (VOTE-005)
 * into the reports detail/list responses.
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
const POINT = { lat: 23.78, lng: 90.41 };

const emails = {
  author: `com_author_${stamp}@example.com`,
  voter: `com_voter_${stamp}@example.com`,
  admin: `com_admin_${stamp}@example.com`,
};

let categoryId = '';
let authorToken = '';
let voterToken = '';
let adminToken = '';
let reportId = '';
const storedUrls: string[] = [];

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ name: 'User', email, password: 'CorrectHorse9' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'CorrectHorse9' });
  const cookies = login.headers['set-cookie'] as unknown as string[];
  return cookies.find((c) => c.startsWith('access_token='))!.split(';')[0].split('=')[1];
}

async function createReport(token: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/reports')
    .set('Authorization', `Bearer ${token}`)
    .field('title', 'Overflowing public bin')
    .field('description', 'The bin near the park gate has been overflowing for days.')
    .field('categoryId', categoryId)
    .field('severity', 'medium')
    .field('latitude', String(POINT.lat))
    .field('longitude', String(POINT.lng))
    .attach('images', PNG, { filename: 'photo.png', contentType: 'image/png' });
  storedUrls.push(res.body.data.report.images[0].imageUrl);
  return res.body.data.report.id;
}

const bearer = (t: string) => ['Authorization', `Bearer ${t}`] as const;

beforeAll(async () => {
  const cat = await prisma.category.create({ data: { name: `Sanitation ${stamp}`, icon: 'trash' } });
  categoryId = cat.id;
  authorToken = await registerAndLogin(emails.author);
  voterToken = await registerAndLogin(emails.voter);
  await registerAndLogin(emails.admin);
  await prisma.user.update({ where: { email: emails.admin }, data: { role: 'admin' } });
  adminToken = await registerAndLogin(emails.admin);
  reportId = await createReport(authorToken);
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
  await Promise.all(
    storedUrls.map((u) => unlink(path.join(uploadDir, path.basename(u))).catch(() => {})),
  );
  await prisma.$disconnect();
});

describe('owner auto-subscription on report creation (§13.5)', () => {
  it('creates an owner-sourced subscription for the reporter', async () => {
    const author = await prisma.user.findUnique({ where: { email: emails.author } });
    const sub = await prisma.reportSubscription.findFirst({
      where: { reportId, userId: author!.id },
    });
    expect(sub?.source).toBe('owner');
  });
});

describe('comments (COM-*)', () => {
  let commentId = '';

  it('requires auth to post (COM-001)', async () => {
    const res = await request(app).post(`/api/v1/reports/${reportId}/comments`).send({ content: 'hi' });
    expect(res.status).toBe(401);
  });

  it('rejects an empty comment (COM-005)', async () => {
    const res = await request(app)
      .post(`/api/v1/reports/${reportId}/comments`)
      .set(...bearer(voterToken))
      .send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('sanitizes stored content (COM-006) and returns the author', async () => {
    const res = await request(app)
      .post(`/api/v1/reports/${reportId}/comments`)
      .set(...bearer(voterToken))
      .send({ content: '<script>alert(1)</script> please fix' });
    expect(res.status).toBe(201);
    expect(res.body.data.comment.content).toContain('&lt;script&gt;');
    expect(res.body.data.comment.content).not.toContain('<script>');
    expect(res.body.data.comment.author.id).toBeDefined();
    commentId = res.body.data.comment.id;
  });

  it('lists comments for the report (COM-002)', async () => {
    const res = await request(app).get(`/api/v1/reports/${reportId}/comments`);
    expect(res.status).toBe(200);
    expect(res.body.data.comments.some((c: { id: string }) => c.id === commentId)).toBe(true);
  });

  it('returns 404 commenting on a missing report', async () => {
    const res = await request(app)
      .post('/api/v1/reports/00000000-0000-0000-0000-000000000000/comments')
      .set(...bearer(voterToken))
      .send({ content: 'hello' });
    expect(res.status).toBe(404);
  });

  it('forbids a non-owner non-admin from deleting (COM-003)', async () => {
    const res = await request(app).delete(`/api/v1/comments/${commentId}`).set(...bearer(authorToken));
    expect(res.status).toBe(403);
  });

  it('lets an admin delete any comment (COM-004), removing it from the list', async () => {
    const res = await request(app).delete(`/api/v1/comments/${commentId}`).set(...bearer(adminToken));
    expect(res.status).toBe(200);
    const list = await request(app).get(`/api/v1/reports/${reportId}/comments`);
    expect(list.body.data.comments.some((c: { id: string }) => c.id === commentId)).toBe(false);
  });

  it('lets the author delete their own comment', async () => {
    const created = await request(app)
      .post(`/api/v1/reports/${reportId}/comments`)
      .set(...bearer(authorToken))
      .send({ content: 'my own comment' });
    const id = created.body.data.comment.id;
    const res = await request(app).delete(`/api/v1/comments/${id}`).set(...bearer(authorToken));
    expect(res.status).toBe(200);
  });
});

describe('votes (VOTE-*, BR-006/007)', () => {
  it('upvotes and is idempotent on repeat (BR-006)', async () => {
    const first = await request(app).post(`/api/v1/reports/${reportId}/upvote`).set(...bearer(voterToken));
    expect(first.status).toBe(200);
    expect(first.body.data.counts.upvotes).toBe(1);

    const second = await request(app).post(`/api/v1/reports/${reportId}/upvote`).set(...bearer(voterToken));
    expect(second.body.data.counts.upvotes).toBe(1);
  });

  it('removes an upvote', async () => {
    const res = await request(app).delete(`/api/v1/reports/${reportId}/upvote`).set(...bearer(voterToken));
    expect(res.body.data.counts.upvotes).toBe(0);
  });

  it('confirm auto-subscribes the user (BR-016) and counts', async () => {
    const res = await request(app).post(`/api/v1/reports/${reportId}/confirm`).set(...bearer(voterToken));
    expect(res.body.data.counts.confirms).toBe(1);

    const voter = await prisma.user.findUnique({ where: { email: emails.voter } });
    const sub = await prisma.reportSubscription.findFirst({
      where: { reportId, userId: voter!.id, source: 'confirm' },
    });
    expect(sub).not.toBeNull();
  });

  it('un-confirm removes the count and the confirm subscription', async () => {
    const res = await request(app).delete(`/api/v1/reports/${reportId}/confirm`).set(...bearer(voterToken));
    expect(res.body.data.counts.confirms).toBe(0);
    const voter = await prisma.user.findUnique({ where: { email: emails.voter } });
    const sub = await prisma.reportSubscription.findFirst({
      where: { reportId, userId: voter!.id, source: 'confirm' },
    });
    expect(sub).toBeNull();
  });

  it('flags a false report (VOTE-006)', async () => {
    const res = await request(app).post(`/api/v1/reports/${reportId}/false-report`).set(...bearer(voterToken));
    expect(res.body.data.counts.falseReports).toBe(1);
  });

  it('returns 404 voting on a missing report', async () => {
    const res = await request(app)
      .post('/api/v1/reports/00000000-0000-0000-0000-000000000000/upvote')
      .set(...bearer(voterToken));
    expect(res.status).toBe(404);
  });
});

describe('follow / unfollow (NOTIF-007)', () => {
  it('follows (explicit) and unfollows a report', async () => {
    const follow = await request(app).post(`/api/v1/reports/${reportId}/follow`).set(...bearer(adminToken));
    expect(follow.body.data.following).toBe(true);
    const admin = await prisma.user.findUnique({ where: { email: emails.admin } });
    const sub = await prisma.reportSubscription.findFirst({ where: { reportId, userId: admin!.id } });
    expect(sub?.source).toBe('explicit');

    const unfollow = await request(app).delete(`/api/v1/reports/${reportId}/follow`).set(...bearer(adminToken));
    expect(unfollow.body.data.following).toBe(false);
    const after = await prisma.reportSubscription.findFirst({ where: { reportId, userId: admin!.id } });
    expect(after).toBeNull();
  });
});

describe('vote-count wiring into reports (VOTE-005)', () => {
  it('exposes counts on the report detail', async () => {
    await request(app).post(`/api/v1/reports/${reportId}/upvote`).set(...bearer(voterToken));
    const res = await request(app).get(`/api/v1/reports/${reportId}`);
    expect(res.body.data.report.counts).toMatchObject({ upvotes: 1 });
  });

  it('exposes counts on the report list', async () => {
    const res = await request(app).get('/api/v1/reports').query({ categoryId });
    const found = res.body.data.items.find((r: { id: string }) => r.id === reportId);
    expect(found.counts).toBeDefined();
    expect(found.counts.upvotes).toBeGreaterThanOrEqual(1);
  });
});

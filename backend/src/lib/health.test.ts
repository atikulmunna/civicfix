import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../app.js';
import { checkDatabase } from './health.js';
import { prisma } from './prisma.js';

const app = buildApp();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /health (liveness)', () => {
  it('is up and never cached', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /health/ready (readiness)', () => {
  it('reports ready when the database answers', async () => {
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ready', checks: { database: 'ok' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 503 when the database fails, while liveness stays up', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, code: 'SERVICE_UNAVAILABLE' });
    expect(logged).toHaveBeenCalledOnce();

    expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('checkDatabase', () => {
  it('times out instead of hanging when the database never answers', async () => {
    vi.spyOn(prisma, '$queryRaw').mockReturnValueOnce(
      new Promise(() => undefined) as unknown as ReturnType<typeof prisma.$queryRaw>,
    );
    await expect(checkDatabase(30)).rejects.toThrow(/timed out after 30 ms/);
  });
});

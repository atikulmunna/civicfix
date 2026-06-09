/**
 * Rate-limiter unit test (ABUSE-003). Verifies the limiter blocks once the
 * window quota is exceeded and returns the RATE_LIMITED envelope. Uses a
 * standalone app with skipInTest disabled (the real app skips limiters under
 * NODE_ENV=test so the integration suites aren't throttled).
 */
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeLimiter } from './rate-limit.js';

function appWithLimit(max: number) {
  const app = express();
  app.use(
    '/ping',
    makeLimiter({ windowMs: 60_000, max, by: 'ip', skipInTest: false }),
    (_req, res) => res.json({ success: true, data: { ok: true } }),
  );
  return app;
}

describe('makeLimiter', () => {
  it('allows requests up to the limit then returns 429 RATE_LIMITED', async () => {
    const app = appWithLimit(2);
    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping')).status).toBe(200);

    const blocked = await request(app).get('/ping');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.body.success).toBe(false);
  });

  it('sets standard RateLimit headers', async () => {
    const app = appWithLimit(5);
    const res = await request(app).get('/ping');
    expect(res.headers).toHaveProperty('ratelimit-limit');
  });
});

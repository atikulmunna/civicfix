/**
 * Rate-limiter tests (ABUSE-003). Verifies the limiter blocks once the window
 * quota is exceeded, returns the RATE_LIMITED envelope, and keys IP limits on
 * the real client behind the production proxy chain (browser -> Vercel ->
 * Fly -> API) without letting callers spoof their IP. Uses standalone apps
 * with skipInTest disabled (the real app skips limiters under NODE_ENV=test).
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PROXY_SECRET_HEADER } from '../lib/client-ip.js';
import { makeLimiter } from './rate-limit.js';

const { SECRET } = vi.hoisted(() => ({ SECRET: 'p'.repeat(40) }));

// Production-like proxy settings: Fly's edge is trusted (1 hop) and the web
// proxy authenticates with the shared secret.
vi.mock('../config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env.js')>();
  return {
    ...actual,
    env: { ...actual.env, TRUST_PROXY_HOPS: 1, PROXY_SHARED_SECRET: SECRET },
  };
});

const VERCEL = '76.76.21.21';

function appWithLimit(max: number, trustProxyHops = 0) {
  const app = express();
  app.set('trust proxy', trustProxyHops);
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

describe('IP limits behind the proxy chain', () => {
  const viaWebProxy = (client: string) => ({
    'X-Forwarded-For': `${client}, ${VERCEL}`,
    [PROXY_SECRET_HEADER]: SECRET,
  });

  it('gives each client its own bucket when traffic comes through the web proxy', async () => {
    const app = appWithLimit(1, 1);
    expect((await request(app).get('/ping').set(viaWebProxy('203.0.113.1'))).status).toBe(200);
    expect((await request(app).get('/ping').set(viaWebProxy('203.0.113.1'))).status).toBe(429);
    // A different user behind the same Vercel egress IP is unaffected.
    expect((await request(app).get('/ping').set(viaWebProxy('203.0.113.2'))).status).toBe(200);
  });

  it('cannot be bypassed by spoofing X-Forwarded-For without the secret', async () => {
    const app = appWithLimit(1, 1);
    const spoofed = (fake: string) => ({ 'X-Forwarded-For': `${fake}, 198.51.100.9` });
    expect((await request(app).get('/ping').set(spoofed('10.0.0.1'))).status).toBe(200);
    // New fake address, same real connecting IP (198.51.100.9): still limited.
    expect((await request(app).get('/ping').set(spoofed('10.0.0.2'))).status).toBe(429);
  });

  it('ignores a wrong secret', async () => {
    const app = appWithLimit(1, 1);
    const forged = (fake: string) => ({
      'X-Forwarded-For': `${fake}, 198.51.100.10`,
      [PROXY_SECRET_HEADER]: 'w'.repeat(40),
    });
    expect((await request(app).get('/ping').set(forged('10.0.0.3'))).status).toBe(200);
    expect((await request(app).get('/ping').set(forged('10.0.0.4'))).status).toBe(429);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// Next 16 docs call this unstable_doesProxyMatch; 16.4.3 still exports the old name.
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { CLIENT_IP_HEADER, config, proxy, PROXY_SECRET_HEADER } from './proxy';

// NextResponse.next({ request: { headers } }) encodes upstream request
// headers as x-middleware-request-* response headers.
const upstream = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

const SECRET = 'k'.repeat(40);
const login = (headers: Record<string, string> = {}) =>
  new NextRequest('https://civicfix.test/api/v1/auth/login', { headers });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy', () => {
  it('runs only on the auth routes', () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
    expect(matches('/api/v1/auth/login')).toBe(true);
    expect(matches('/api/v1/auth/register')).toBe(true);
    // Uploads must bypass Proxy (it buffers bodies up to 10 MB).
    expect(matches('/api/v1/reports')).toBe(false);
    expect(matches('/uploads/a.png')).toBe(false);
    expect(matches('/login')).toBe(false);
  });

  it('sends the shared secret and the visitor IP Vercel reported', () => {
    vi.stubEnv('PROXY_SHARED_SECRET', SECRET);
    const res = proxy(login({ 'x-forwarded-for': '203.0.113.7' }));
    expect(upstream(res, PROXY_SECRET_HEADER)).toBe(SECRET);
    expect(upstream(res, CLIENT_IP_HEADER)).toBe('203.0.113.7');
  });

  it('uses the first X-Forwarded-For entry as the visitor', () => {
    vi.stubEnv('PROXY_SHARED_SECRET', SECRET);
    const res = proxy(login({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }));
    expect(upstream(res, CLIENT_IP_HEADER)).toBe('203.0.113.7');
  });

  it('replaces client-supplied secret and client IP headers', () => {
    vi.stubEnv('PROXY_SHARED_SECRET', SECRET);
    const res = proxy(
      login({
        'x-forwarded-for': '203.0.113.7',
        [PROXY_SECRET_HEADER]: 'forged',
        [CLIENT_IP_HEADER]: '1.1.1.1',
      }),
    );
    expect(upstream(res, PROXY_SECRET_HEADER)).toBe(SECRET);
    expect(upstream(res, CLIENT_IP_HEADER)).toBe('203.0.113.7');
  });

  it('strips both headers when no secret is configured', () => {
    vi.stubEnv('PROXY_SHARED_SECRET', '');
    const res = proxy(
      login({
        'x-forwarded-for': '203.0.113.7',
        [PROXY_SECRET_HEADER]: 'forged',
        [CLIENT_IP_HEADER]: '1.1.1.1',
      }),
    );
    expect(upstream(res, PROXY_SECRET_HEADER)).toBeNull();
    expect(upstream(res, CLIENT_IP_HEADER)).toBeNull();
  });

  it('sends nothing when the visitor IP is unknown', () => {
    vi.stubEnv('PROXY_SHARED_SECRET', SECRET);
    const res = proxy(login());
    expect(upstream(res, PROXY_SECRET_HEADER)).toBeNull();
  });
});

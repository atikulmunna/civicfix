import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// Next 16 docs call this unstable_doesProxyMatch; 16.4.3 still exports the old name.
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy, PROXY_SECRET_HEADER } from './proxy';

// NextResponse.next({ request: { headers } }) encodes upstream request
// headers as x-middleware-request-* response headers.
const forwarded = (res: Response) => res.headers.get(`x-middleware-request-${PROXY_SECRET_HEADER}`);

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

  it('adds the shared secret for the API', () => {
    vi.stubEnv('PROXY_SHARED_SECRET', 'k'.repeat(40));
    const res = proxy(new NextRequest('https://civicfix.test/api/v1/auth/login'));
    expect(forwarded(res)).toBe('k'.repeat(40));
  });

  it('replaces a client-supplied secret header', () => {
    vi.stubEnv('PROXY_SHARED_SECRET', 'k'.repeat(40));
    const req = new NextRequest('https://civicfix.test/api/v1/auth/login', {
      headers: { [PROXY_SECRET_HEADER]: 'forged' },
    });
    expect(forwarded(proxy(req))).toBe('k'.repeat(40));
  });

  it('strips a client-supplied secret header when no secret is configured', () => {
    vi.stubEnv('PROXY_SHARED_SECRET', '');
    const req = new NextRequest('https://civicfix.test/api/v1/auth/login', {
      headers: { [PROXY_SECRET_HEADER]: 'forged' },
    });
    expect(forwarded(proxy(req))).toBeNull();
  });
});

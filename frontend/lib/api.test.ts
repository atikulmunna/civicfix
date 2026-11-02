import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { ok: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(api.get('/x', { a: 1 }, { signal: controller.signal })).resolves.toEqual({
      ok: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/x?a=1'),
      expect.objectContaining({ signal: controller.signal, credentials: 'include' }),
    );
  });

  it('rethrows an aborted request as-is instead of reporting a network error', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    const controller = new AbortController();
    controller.abort();

    await expect(api.get('/x', undefined, { signal: controller.signal })).rejects.toBe(abortError);
  });

  it('reports a real network failure as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const err = await api.get('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK_ERROR');
  });

  it('unwraps API error envelopes into ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ success: false, message: 'Not found.', code: 'NOT_FOUND' }, 404),
        ),
    );

    const err = await api.get('/x').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'NOT_FOUND', status: 404, message: 'Not found.' });
  });
});

describe('session refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const expired = () =>
    jsonResponse(
      { success: false, message: 'Authentication required.', code: 'AUTH_REQUIRED' },
      401,
    );
  const ok = (data: unknown) => jsonResponse({ success: true, data });

  /** fetch mock: queued responses for /auth/refresh and for everything else. */
  function mockFetch(refresh: (() => Response)[], other: (() => Response)[]) {
    const fetchMock = vi.fn((url: string) => {
      const next = url.endsWith('/auth/refresh') ? refresh.shift() : other.shift();
      if (!next) throw new Error(`unexpected fetch ${url}`);
      return Promise.resolve(next());
    });
    vi.stubGlobal('fetch', fetchMock);
    const urls = () => fetchMock.mock.calls.map(([u]) => u.replace(/^.*\/api\/v1/, ''));
    return urls;
  }

  it('refreshes once on AUTH_REQUIRED and retries the request', async () => {
    const urls = mockFetch([() => ok({ refreshed: true })], [expired, () => ok({ n: 1 })]);
    await expect(api.get('/users/me/reports')).resolves.toEqual({ n: 1 });
    expect(urls()).toEqual(['/users/me/reports', '/auth/refresh', '/users/me/reports']);
  });

  it('shares one refresh between concurrent expired requests', async () => {
    const urls = mockFetch(
      [() => ok({ refreshed: true })],
      [expired, expired, () => ok('a'), () => ok('b')],
    );
    await Promise.all([api.get('/a'), api.get('/b')]);
    expect(urls().filter((u) => u === '/auth/refresh')).toHaveLength(1);
  });

  it('surfaces the original error when the refresh fails (signed out)', async () => {
    const urls = mockFetch([expired], [expired]);
    await expect(api.get('/auth/me')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(urls()).toEqual(['/auth/me', '/auth/refresh']);
  });

  it('retries at most once', async () => {
    const urls = mockFetch([() => ok({ refreshed: true })], [expired, expired]);
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(urls()).toEqual(['/x', '/auth/refresh', '/x']);
  });

  it('never refreshes for the auth endpoints themselves', async () => {
    const urls = mockFetch([], [expired]);
    await expect(api.post('/auth/login', { email: 'a', password: 'b' })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(urls()).toEqual(['/auth/login']);
  });
});

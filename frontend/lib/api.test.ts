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

import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import request from 'supertest';
import { buildApp } from '../app.js';
import { errorHandler } from './error-handler.js';
import { createLogger } from './logger.js';

/** A logger with production options that collects parsed JSON lines. */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  return { logger: createLogger(stream), lines };
}

describe('logger', () => {
  it('writes structured JSON with a readable level and service name', () => {
    const { logger, lines } = capture();
    logger.info({ port: 8080 }, 'listening');
    expect(lines[0]).toMatchObject({ level: 'info', service: 'civicfix-api', port: 8080 });
    expect(lines[0]?.msg).toBe('listening');
  });

  it('redacts credentials, tokens and secrets', () => {
    const { logger, lines } = capture();
    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer abc',
            cookie: 'refresh_token=xyz',
            'x-civicfix-proxy-secret': 's3cret',
            'user-agent': 'kept',
          },
        },
        body: { email: 'a@b.c', password: 'hunter2', newPassword: 'n3w' },
        session: { refreshToken: 'r', accessToken: 'a' },
      },
      'incoming',
    );
    const out = JSON.stringify(lines[0]);
    for (const secret of ['Bearer abc', 'refresh_token=xyz', 's3cret', 'hunter2', 'n3w']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[redacted]');
    expect(out).toContain('kept');
    expect(out).toContain('a@b.c');
  });
});

describe('request ids', () => {
  const app = buildApp();

  it('assigns one to every response', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reuses a well-formed incoming id and replaces a malformed one', async () => {
    const kept = await request(app).get('/health').set('X-Request-Id', 'trace-1234abcd');
    expect(kept.headers['x-request-id']).toBe('trace-1234abcd');
    const replaced = await request(app).get('/health').set('X-Request-Id', 'bad id<script>');
    expect(replaced.headers['x-request-id']).not.toBe('bad id<script>');
  });
});

describe('errorHandler (unexpected errors)', () => {
  it('logs the error and returns a generic 500 carrying the request id', () => {
    const logError = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = { id: 'req-12345678', log: { error: logError } } as unknown as Request;
    const res = { status } as unknown as Response;

    const boom = new Error('secret internal detail');
    errorHandler(boom, req, res, vi.fn());

    expect(logError).toHaveBeenCalledWith({ err: boom }, 'unhandled error');
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error.',
      code: 'INTERNAL_ERROR',
      requestId: 'req-12345678',
    });
  });
});

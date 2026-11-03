import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { startServer } from './start-server.js';

const open: Server[] = [];
afterEach(async () => {
  await Promise.all(
    open.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => {
            resolve();
          });
        }),
    ),
  );
});

function hooks() {
  let settle: () => void = () => undefined;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const listening = vi.fn(() => {
    settle();
  });
  const failed = vi.fn(() => {
    settle();
  });
  return { listening, failed, settled };
}

describe('startServer', () => {
  it('reports listening once the port is bound', async () => {
    const h = hooks();
    const server = startServer(express(), 0, h);
    open.push(server);
    await h.settled;
    expect(h.listening).toHaveBeenCalledOnce();
    expect(h.failed).not.toHaveBeenCalled();
  });

  it('reports failure, not listening, when the port is taken', async () => {
    const blocker = createServer();
    open.push(blocker);
    await new Promise<void>((resolve) => blocker.listen(0, resolve));
    const { port } = blocker.address() as AddressInfo;

    const h = hooks();
    startServer(express(), port, h);
    await h.settled;
    expect(h.listening).not.toHaveBeenCalled();
    expect(h.failed).toHaveBeenCalledWith(expect.objectContaining({ code: 'EADDRINUSE' }));
  });
});

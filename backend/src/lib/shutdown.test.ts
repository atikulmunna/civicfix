import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShutdown, type Closable } from './shutdown.js';

function harness(options: { closeError?: Error; neverCloses?: boolean } = {}) {
  const order: string[] = [];
  const server: Closable = {
    close: (cb) => {
      order.push('close');
      if (!options.neverCloses)
        queueMicrotask(() => {
          cb(options.closeError);
        });
    },
  };
  const disconnect = vi.fn(() => {
    order.push('disconnect');
    return Promise.resolve();
  });
  const exit = vi.fn((code: number) => order.push(`exit:${String(code)}`));
  const shutdown = createShutdown({
    server,
    disconnect,
    exit,
    log: () => undefined,
    timeoutMs: 8000,
  });
  return { shutdown, order, disconnect, exit };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createShutdown', () => {
  it('stops the server, then closes the database pool, then exits 0', async () => {
    const h = harness();
    h.shutdown('SIGTERM');
    await vi.waitFor(() => {
      expect(h.exit).toHaveBeenCalled();
    });
    expect(h.order).toEqual(['close', 'disconnect', 'exit:0']);
  });

  it('ignores repeated signals', async () => {
    const h = harness();
    h.shutdown('SIGTERM');
    h.shutdown('SIGINT');
    await vi.waitFor(() => {
      expect(h.exit).toHaveBeenCalled();
    });
    expect(h.order.filter((s) => s === 'close')).toHaveLength(1);
  });

  it('exits 1 if closing the server failed', async () => {
    const h = harness({ closeError: new Error('not running') });
    h.shutdown('SIGTERM');
    await vi.waitFor(() => {
      expect(h.exit).toHaveBeenCalledWith(1);
    });
  });

  it('forces exit 1 when draining hangs past the deadline', () => {
    vi.useFakeTimers();
    const h = harness({ neverCloses: true });
    h.shutdown('SIGTERM');
    vi.advanceTimersByTime(7999);
    expect(h.exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.disconnect).not.toHaveBeenCalled();
  });
});

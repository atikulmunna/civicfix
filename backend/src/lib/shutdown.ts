/**
 * Graceful shutdown (task R7).
 *
 * Fly stops the machine on every deploy: it sends `kill_signal` (SIGTERM, see
 * fly.toml) and force-kills after `kill_timeout`. Without a handler, requests
 * in flight were cut off mid-response. On a signal we stop accepting new
 * connections, let in-flight requests finish, close the database pool, then
 * exit. A deadline below Fly's kill timeout forces the exit if draining hangs.
 */

/** The part of http.Server shutdown needs (lets tests pass a fake). */
export interface Closable {
  close(callback: (err?: Error) => void): unknown;
}

export interface ShutdownDeps {
  server: Closable;
  /** Release external resources (the Prisma connection pool). */
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  log: (message: string) => void;
  /** Force exit after this long; keep it below Fly's kill_timeout. */
  timeoutMs: number;
}

/** Handler for SIGTERM/SIGINT. Repeated signals are ignored. */
export function createShutdown(deps: ShutdownDeps): (signal: string) => void {
  let shuttingDown = false;
  return (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    deps.log(`received ${signal}; draining in-flight requests`);

    const deadline = setTimeout(() => {
      deps.log(`shutdown did not finish within ${deps.timeoutMs} ms; forcing exit`);
      deps.exit(1);
    }, deps.timeoutMs);
    deadline.unref();

    deps.server.close((closeError) => {
      void deps
        .disconnect()
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(deadline);
          deps.log('shutdown complete');
          deps.exit(closeError ? 1 : 0);
        });
    });
  };
}

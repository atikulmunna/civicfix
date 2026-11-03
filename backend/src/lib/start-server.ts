/**
 * Starts the HTTP server. Express 5 passes listen errors (e.g. EADDRINUSE) to
 * the callback instead of throwing, so a callback that ignores its argument
 * would log "listening" for a server that never bound its port. This makes
 * the failure explicit.
 */
import type { Server } from 'node:http';
import type { Express } from 'express';

export interface StartHooks {
  listening: () => void;
  failed: (error: Error) => void;
}

export function startServer(app: Express, port: number, hooks: StartHooks): Server {
  return app.listen(port, (error?: Error) => {
    if (error) hooks.failed(error);
    else hooks.listening();
  });
}

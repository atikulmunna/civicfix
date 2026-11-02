/** Process entry point: build the app, start listening, shut down gracefully. */
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { createShutdown } from './lib/shutdown.js';

const app = buildApp();
const server = app.listen(env.PORT, () => {
  console.log(`CivicFix API listening on http://localhost:${env.PORT}`);
});

// Below fly.toml's kill_timeout (10 s), so we exit on our own terms.
const shutdown = createShutdown({
  server,
  disconnect: () => prisma.$disconnect(),
  exit: (code) => process.exit(code),
  log: (message) => {
    console.log(`[shutdown] ${message}`);
  },
  timeoutMs: 8000,
});
process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.once('SIGINT', () => {
  shutdown('SIGINT');
});

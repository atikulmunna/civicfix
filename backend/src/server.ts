/** Process entry point: build the app, start listening, shut down gracefully. */
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createShutdown } from './lib/shutdown.js';
import { startServer } from './lib/start-server.js';

const app = buildApp();
const server = startServer(app, env.PORT, {
  listening: () => {
    logger.info({ port: env.PORT }, 'CivicFix API listening');
  },
  failed: (error) => {
    logger.fatal({ err: error, port: env.PORT }, 'CivicFix API could not start');
    process.exit(1);
  },
});

// Below fly.toml's kill_timeout (10 s), so we exit on our own terms.
const shutdown = createShutdown({
  server,
  disconnect: () => prisma.$disconnect(),
  exit: (code) => process.exit(code),
  log: (message) => {
    logger.info({ component: 'shutdown' }, message);
  },
  timeoutMs: 8000,
});
process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.once('SIGINT', () => {
  shutdown('SIGINT');
});

/**
 * Express application factory. Kept separate from server.ts so tests can
 * import a configured app without binding a port.
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { ApiError } from './lib/errors.js';
import { errorHandler } from './lib/error-handler.js';
import { checkDatabase } from './lib/health.js';
import { routeParam, sendSuccess } from './lib/http.js';
import { logger } from './lib/logger.js';
import { LocalStore, objectStore, STORAGE_KEY_PATTERN } from './lib/storage.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { commentsRouter, communityRouter } from './modules/community/community.routes.js';
import {
  adminReportsRouter,
  departmentRouter,
  reportHistoryRouter,
} from './modules/admin/workflow.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { usersRouter } from './modules/users/me.routes.js';
import {
  adminCategoriesRouter,
  adminDepartmentsRouter,
  adminUsersRouter,
  categoriesRouter,
  departmentsRouter,
} from './modules/admin/admin-crud.routes.js';
import { analyticsRouter } from './modules/admin/analytics.routes.js';

/** A caller-supplied X-Request-Id is reused only if it looks like an id. */
const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

export function buildApp() {
  const app = express();

  // Trust exactly the reverse proxies we deploy behind (Fly's edge: 1), so
  // req.ip is the address that connected to them, never a client-supplied
  // X-Forwarded-For value. See lib/client-ip.ts for the web-proxy hop.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // One structured log line per request, with a request id that is echoed in
  // X-Request-Id (and in 500 responses) so reports can be traced. Fly's
  // liveness check hits /health every 30 s and is not worth logging.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'info'),
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(helmet()); // baseline security headers (SEC-013)
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

  // Liveness (Fly's machine check): never touches the database. See lib/health.ts.
  app.get('/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, { status: 'ok' });
  });

  // Readiness (uptime monitor): the database answers.
  app.get('/health/ready', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await checkDatabase();
    } catch (err) {
      req.log.error({ err }, 'database check failed');
      throw new ApiError('SERVICE_UNAVAILABLE', 'Database unavailable.');
    }
    sendSuccess(res, { status: 'ready', checks: { database: 'ok' } });
  });

  if (objectStore instanceof LocalStore) {
    // Serve uploaded images read-only; nosniff prevents content-type confusion.
    app.use(
      '/uploads',
      express.static(objectStore.dir, {
        index: false,
        setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
      }),
    );
  } else {
    // Bucket storage: images live at the bucket's public URL. Redirect so
    // direct API clients keep working; the web app rewrites /uploads straight
    // to the bucket (and its CDN caches it).
    app.get('/uploads/:key', (req, res) => {
      const key = routeParam(req, 'key');
      if (!STORAGE_KEY_PATTERN.test(key)) throw new ApiError('NOT_FOUND', 'Not found.');
      res.redirect(301, objectStore.publicUrl(key));
    });
  }

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/reports', reportsRouter);
  // Community sub-resources share the /reports prefix (distinct sub-paths).
  app.use('/api/v1/reports', communityRouter);
  app.use('/api/v1/reports', reportHistoryRouter);
  app.use('/api/v1/comments', commentsRouter);
  app.use('/api/v1/admin/reports', adminReportsRouter);
  app.use('/api/v1/department', departmentRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/categories', categoriesRouter);
  app.use('/api/v1/departments', departmentsRouter);
  app.use('/api/v1/admin/users', adminUsersRouter);
  app.use('/api/v1/admin/categories', adminCategoriesRouter);
  app.use('/api/v1/admin/departments', adminDepartmentsRouter);
  app.use('/api/v1/admin/analytics', analyticsRouter);

  // 404 for unmatched routes.
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Not found.', code: 'NOT_FOUND' });
  });

  // Central error handler: standard error envelope (§22.1).
  app.use(errorHandler);

  return app;
}

/**
 * Express application factory. Kept separate from server.ts so tests can
 * import a configured app without binding a port.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { env } from './config/env.js';
import { ApiError } from './lib/errors.js';
import { uploadDir } from './lib/uploads.js';
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

export function buildApp() {
  const app = express();

  app.use(helmet()); // baseline security headers (SEC-013)
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  // Serve uploaded images read-only; nosniff prevents content-type confusion.
  app.use(
    '/uploads',
    express.static(uploadDir, {
      index: false,
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );

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

  // Central error handler → standard error envelope (§22.1).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({
        success: false,
        message: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
      return;
    }
    // Multer upload failures (e.g. file too large) → VALIDATION_ERROR.
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Each image must be at most ${env.MAX_UPLOAD_BYTES} bytes.`
          : `Upload error: ${err.message}.`;
      res.status(400).json({ success: false, message, code: 'VALIDATION_ERROR' });
      return;
    }
    // Unexpected: log server-side, return generic 500 (don't leak internals).
    console.error('[unhandled error]', err);
    res.status(500).json({ success: false, message: 'Internal server error.', code: 'INTERNAL_ERROR' });
  });

  return app;
}

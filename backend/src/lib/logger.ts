/**
 * Structured logging (task R6). One JSON object per line on stdout, which Fly
 * collects; readable output in development; silent in tests.
 *
 * Request logging and request ids are added in app.ts (pino-http). Code with a
 * request uses `req.log` (carries the request id); code without one uses
 * `logger`. `console.*` is banned in app code by ESLint.
 */
import { pino, stdTimeFunctions, type DestinationStream, type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

/** Header and field paths that must never reach the logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-civicfix-proxy-secret"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

/** Production logger options; shared with tests through createLogger. */
export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    base: { service: 'civicfix-api' },
    timestamp: stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    // "level":"warn" instead of pino's numeric levels: easier to read and filter.
    formatters: { level: (label) => ({ level: label }) },
  };
}

const level = env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info');

export const logger =
  env.NODE_ENV === 'development'
    ? pino({
        level,
        redact: { paths: REDACT_PATHS, censor: '[redacted]' },
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      })
    : pino(loggerOptions(level));

/** A logger with the production options writing to `destination` (tests). */
export function createLogger(destination: DestinationStream, minLevel = 'info') {
  return pino(loggerOptions(minLevel), destination);
}

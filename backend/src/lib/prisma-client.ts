/**
 * Builds a PrismaClient. Prisma 7 talks to Postgres through a driver adapter
 * (node-postgres) instead of a native query engine.
 *
 * Kept free of src/config/env.ts so the seed script can use it without the
 * app's secrets; the app's shared instance lives in ./prisma.ts.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * node-postgres waits forever for a connection by default (Prisma 5 gave up
 * after 5 s). 15 s allows for a Neon compute waking from scale-to-zero.
 */
export const CONNECT_TIMEOUT_MS = 15_000;

/** sslmode values that node-postgres 8 verifies fully but pg 9 will not. */
const WEAKENING_SSL_MODES = new Set(['prefer', 'require', 'verify-ca']);

/**
 * Pins certificate verification for TLS connections. node-postgres 8 already
 * treats sslmode=require as verify-full (and warns at startup); pg 9 will
 * switch to libpq's meaning, which encrypts without checking the server's
 * certificate. Neon's connection strings use require, so state verify-full
 * explicitly to keep today's guarantee. URLs without sslmode (local Docker)
 * are returned unchanged.
 */
export function withVerifiedTls(connectionString: string): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  const mode = url.searchParams.get('sslmode');
  if (mode === null || !WEAKENING_SSL_MODES.has(mode)) return connectionString;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: withVerifiedTls(connectionString),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  return new PrismaClient({
    adapter,
    // A transaction must first get a connection, and with the driver adapter
    // that includes opening one. Prisma's default maxWait (2 s) is shorter
    // than a Neon compute takes to wake, so the first transaction after an
    // idle period failed with P2028 (production, 2026-11-03). Allow as long
    // as connecting itself may take.
    transactionOptions: { maxWait: CONNECT_TIMEOUT_MS },
  });
}

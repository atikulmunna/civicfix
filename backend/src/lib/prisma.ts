/**
 * Single PrismaClient instance for the process. Re-using one client avoids
 * exhausting the Postgres connection pool across requests and test runs.
 */
import { env } from '../config/env.js';
import { createPrismaClient } from './prisma-client.js';

export const prisma = createPrismaClient(env.DATABASE_URL);

/**
 * Single PrismaClient instance for the process. Re-using one client avoids
 * exhausting the Postgres connection pool across requests and test runs.
 */
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

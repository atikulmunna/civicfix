/**
 * Recomputes every reporter's trust score and every report's priority anchor
 * (F1). Runs after migrations in Fly's release step (`npm run release`), so
 * existing reports are ranked and a change of weights applies everywhere.
 */
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { recomputeAll } from '../modules/reports/triage.service.js';

try {
  const result = await recomputeAll(prisma);
  logger.info(result, 'triage recomputed');
} finally {
  await prisma.$disconnect();
}

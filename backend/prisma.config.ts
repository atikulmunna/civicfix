/**
 * Prisma CLI configuration (Prisma 7): schema and migration paths, the seed
 * command, and the database the CLI talks to. The app itself connects through
 * src/lib/prisma.ts and never reads this file.
 *
 * This is tooling config, like vitest.config.ts, so it reads process.env
 * directly instead of src/config/env.ts (which requires the app's secrets).
 * Prisma 7 no longer loads .env on its own, hence dotenv. In production
 * (Fly release_command) the variables come from secrets and there is no .env.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrate needs a direct (unpooled) connection. Optional here so that
    // `prisma generate` and `prisma validate` work without any database, e.g.
    // during the Docker build; commands that connect fail clearly if unset.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    // Only the CI drift check (prisma migrate diff) uses a shadow database.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});

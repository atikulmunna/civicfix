import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration suites run real Prisma queries against Postgres. A full
    // status lifecycle makes many sequential round trips, which exceeds
    // Vitest's 5 s default on a remote database (CI, Neon branches).
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Fails any test whose requests broke the API contract (src/contract).
    setupFiles: ['src/test/contract-setup.ts'],
  },
});

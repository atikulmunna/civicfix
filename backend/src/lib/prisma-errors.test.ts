import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { apiErrorFromPrisma, isUniqueViolation } from './prisma-errors.js';
import { prisma } from './prisma.js';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test', meta });

describe('apiErrorFromPrisma', () => {
  it.each([
    ['P2002', 409, 'DUPLICATE_RESOURCE'],
    ['P2025', 404, 'NOT_FOUND'],
    ['P2003', 400, 'VALIDATION_ERROR'],
    ['P2023', 400, 'VALIDATION_ERROR'],
  ])('maps %s to %i %s', (code, status, apiCode) => {
    expect(apiErrorFromPrisma(known(code))).toMatchObject({ status, code: apiCode });
  });

  it('maps a raw query with malformed input (Postgres 22P02) to 400', () => {
    expect(apiErrorFromPrisma(known('P2010', { code: '22P02' }))).toMatchObject({ status: 400 });
  });

  it('reads the Postgres code where Prisma 7 driver adapters report it', () => {
    const adapter = (originalCode: string) => ({ driverAdapterError: { cause: { originalCode } } });
    expect(apiErrorFromPrisma(known('P2007', adapter('22P02')))).toMatchObject({ status: 400 });
    expect(apiErrorFromPrisma(known('P2010', adapter('22P02')))).toMatchObject({ status: 400 });
    expect(apiErrorFromPrisma(known('P2007', adapter('23514')))).toBeNull();
  });

  it('leaves other raw query failures and unknown codes as unexpected', () => {
    expect(apiErrorFromPrisma(known('P2010', { code: '40001' }))).toBeNull();
    expect(apiErrorFromPrisma(known('P1001'))).toBeNull();
  });

  it('ignores errors that are not Prisma known request errors', () => {
    expect(apiErrorFromPrisma(new Error('boom'))).toBeNull();
    expect(apiErrorFromPrisma('nope')).toBeNull();
  });
});

/**
 * The shapes above are what we expect; these are what the database driver
 * actually produces, so a Prisma or adapter upgrade that changes them fails
 * here instead of turning client mistakes into 500s.
 */
describe('apiErrorFromPrisma against the database', () => {
  async function errorOf(run: () => Promise<unknown>): Promise<unknown> {
    try {
      await run();
    } catch (err) {
      return err;
    }
    throw new Error('expected the query to fail');
  }

  it('maps a malformed UUID in an ORM query to 400', async () => {
    const err = await errorOf(() => prisma.report.findUnique({ where: { id: 'not-a-uuid' } }));
    expect(apiErrorFromPrisma(err)).toMatchObject({ status: 400, message: 'Invalid identifier.' });
  });

  it('maps a malformed UUID in a raw query to 400', async () => {
    const err = await errorOf(
      () => prisma.$queryRaw`SELECT id FROM reports WHERE id = ${'not-a-uuid'}::uuid`,
    );
    expect(apiErrorFromPrisma(err)).toMatchObject({ status: 400, message: 'Invalid identifier.' });
  });

  it('maps a missing record on update to 404', async () => {
    const err = await errorOf(() =>
      prisma.category.update({
        where: { id: '00000000-0000-4000-8000-000000000000' },
        data: { name: 'x' },
      }),
    );
    expect(apiErrorFromPrisma(err)).toMatchObject({ status: 404 });
  });
});

describe('isUniqueViolation', () => {
  it('detects only P2002', () => {
    expect(isUniqueViolation(known('P2002'))).toBe(true);
    expect(isUniqueViolation(known('P2025'))).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});

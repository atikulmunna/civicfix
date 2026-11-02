import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { apiErrorFromPrisma, isUniqueViolation } from './prisma-errors.js';

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

  it('leaves other raw query failures and unknown codes as unexpected', () => {
    expect(apiErrorFromPrisma(known('P2010', { code: '40001' }))).toBeNull();
    expect(apiErrorFromPrisma(known('P1001'))).toBeNull();
  });

  it('ignores errors that are not Prisma known request errors', () => {
    expect(apiErrorFromPrisma(new Error('boom'))).toBeNull();
    expect(apiErrorFromPrisma('nope')).toBeNull();
  });
});

describe('isUniqueViolation', () => {
  it('detects only P2002', () => {
    expect(isUniqueViolation(known('P2002'))).toBe(true);
    expect(isUniqueViolation(known('P2025'))).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });
});

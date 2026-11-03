/**
 * Translation of known database errors into API errors (task R3).
 *
 * Without it, every Prisma error reached the central handler as a 500: a
 * malformed id in a URL, a unique-constraint race, a record deleted between
 * read and write. These are client or concurrency outcomes, not server faults.
 */
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from './errors.js';

/** True if an error is a Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Postgres "invalid_text_representation", e.g. a malformed UUID. */
const PG_INVALID_TEXT = '22P02';

interface ErrorMeta {
  code?: unknown;
  driverAdapterError?: { cause?: { originalCode?: unknown } };
}

/**
 * The Postgres SQLSTATE behind a Prisma error, if any. Since Prisma 7 the
 * driver adapter reports it as driverAdapterError.cause.originalCode; older
 * engines put it in meta.code.
 */
function postgresCode(err: Prisma.PrismaClientKnownRequestError): unknown {
  const meta = err.meta as ErrorMeta | undefined;
  return meta?.driverAdapterError?.cause?.originalCode ?? meta?.code;
}

/**
 * Map a known Prisma error to an ApiError, or return null for anything
 * unexpected (which stays a logged 500).
 */
export function apiErrorFromPrisma(err: unknown): ApiError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  switch (err.code) {
    case 'P2002': // unique constraint
      return new ApiError('DUPLICATE_RESOURCE', 'This resource already exists.');
    case 'P2025': // record to update or delete does not exist (anymore)
      return new ApiError('NOT_FOUND', 'Not found.');
    case 'P2003': // foreign key: references something that does not exist
      return new ApiError('VALIDATION_ERROR', 'A referenced resource does not exist.');
    case 'P2023': // malformed value for the column, e.g. an id that is not a UUID
      return new ApiError('VALIDATION_ERROR', 'Invalid identifier.');
    case 'P2007': // data validation (Prisma 7 ORM queries)
    case 'P2010': // raw query failure
      // Only malformed input (e.g. an id that is not a UUID) is a client error.
      return postgresCode(err) === PG_INVALID_TEXT
        ? new ApiError('VALIDATION_ERROR', 'Invalid identifier.')
        : null;
    default:
      return null;
  }
}

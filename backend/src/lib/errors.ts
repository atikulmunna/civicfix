/**
 * Application error type + the canonical error codes from SRS v1.1 §22.2.
 * Throw ApiError anywhere in a request flow; the central error handler
 * (see app.ts) turns it into the standard error envelope.
 */

/** Every error code the API may return (also published in the OpenAPI contract). */
export const ERROR_CODES = [
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'DUPLICATE_RESOURCE',
  'INVALID_STATUS_TRANSITION',
  'RATE_LIMITED',
  'UPLOAD_FAILED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  DUPLICATE_RESOURCE: 409,
  INVALID_STATUS_TRANSITION: 422,
  RATE_LIMITED: 429,
  UPLOAD_FAILED: 400,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

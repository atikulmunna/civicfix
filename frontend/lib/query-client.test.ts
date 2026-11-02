import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('never retries client errors (4xx)', () => {
    expect(shouldRetry(0, new ApiError('Bad', 'VALIDATION_ERROR', 400))).toBe(false);
    expect(shouldRetry(0, new ApiError('Nope', 'AUTH_REQUIRED', 401))).toBe(false);
    expect(shouldRetry(0, new ApiError('Gone', 'NOT_FOUND', 404))).toBe(false);
  });

  it('retries transient failures at most twice', () => {
    const serverError = new ApiError('Boom', 'INTERNAL_ERROR', 500);
    const networkError = new ApiError('Network error.', 'NETWORK_ERROR', 0);
    expect(shouldRetry(0, serverError)).toBe(true);
    expect(shouldRetry(1, networkError)).toBe(true);
    expect(shouldRetry(2, serverError)).toBe(false);
  });
});

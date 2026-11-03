import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';
import { reportListPrefixes } from './query-keys';

/** Retry transient failures (network, 5xx) at most twice; never retry 4xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/**
 * App-wide TanStack Query defaults.
 * - staleTime 30 s: lists and catalogs change slowly; avoids refetching on
 *   every navigation while still refreshing within a minute.
 * - retry: only transient errors. A 4xx (validation, auth, not found) will
 *   not change on retry, so fail fast and show the error.
 * - mutations never retry: they are not guaranteed to be idempotent.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}

/**
 * Marks every report list stale after a write that changes reports. Lists on
 * screen refetch now; the rest refetch when next shown.
 */
export async function invalidateReportLists(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    reportListPrefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { reportClientError } from '@/lib/report-error';
import { Button, Card } from './ui';

/**
 * Errors from Server Components reach the browser without their message, but
 * with a digest that matches the server log line, so show it as a reference.
 */
function digestOf(error: unknown): string | undefined {
  if (error instanceof Error && 'digest' in error && typeof error.digest === 'string') {
    return error.digest;
  }
  return undefined;
}

/** Shared UI for the route and root error boundaries (app/error.tsx, app/global-error.tsx). */
export function ErrorFallback({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  const digest = digestOf(error);

  return (
    <Card className="mx-auto w-full max-w-md text-center">
      <div role="alert">
        <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page hit an unexpected error. Try again, or go back to the home page.
        </p>
        {digest && (
          <p className="mt-2 text-xs text-slate-500">
            Reference: <code>{digest}</code>
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
        >
          Home
        </Link>
      </div>
    </Card>
  );
}

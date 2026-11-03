'use client';

import { ErrorFallback } from '@/components/error-fallback';

/**
 * Catches errors thrown while rendering any page. It sits inside the root
 * layout, so the navbar stays usable. `retry` re-fetches and re-renders the
 * page (Next 16.3+).
 */
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="py-10">
      <ErrorFallback error={error} retry={retry} />
    </div>
  );
}

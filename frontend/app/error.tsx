'use client';

import { ErrorFallback, useFallbackText } from '@/components/error-fallback';

/**
 * Catches errors thrown while rendering any page. It sits inside the root
 * layout, so the navbar stays usable and the reader's language is known.
 * `retry` re-fetches and re-renders the page (Next 16.3+).
 */
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const text = useFallbackText();
  return (
    <div className="py-10">
      <ErrorFallback error={error} retry={retry} texts={[text]} />
    </div>
  );
}

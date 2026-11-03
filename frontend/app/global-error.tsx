'use client';

import './globals.css';
import { ErrorFallback } from '@/components/error-fallback';

/**
 * Last resort when the root layout itself fails. It replaces the whole
 * document, so it renders its own html and body and imports the styles.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full items-center justify-center bg-slate-50 px-4">
        <title>Something went wrong | CivicFix</title>
        <ErrorFallback error={error} retry={retry} />
      </body>
    </html>
  );
}

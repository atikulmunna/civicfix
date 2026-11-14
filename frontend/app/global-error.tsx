'use client';

import './globals.css';
import { ErrorFallback, GLOBAL_ERROR_TEXT } from '@/components/error-fallback';

const DOCUMENT_TITLE = `${GLOBAL_ERROR_TEXT.map((text) => text.title).join(' / ')} | CivicFix`;

/**
 * Last resort when the root layout itself fails. It replaces the whole
 * document, so it renders its own html and body and imports the styles. It
 * has no translation provider, so it speaks both languages.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full items-center justify-center bg-slate-50 px-4">
        <title>{DOCUMENT_TITLE}</title>
        <ErrorFallback error={error} retry={retry} texts={GLOBAL_ERROR_TEXT} />
      </body>
    </html>
  );
}

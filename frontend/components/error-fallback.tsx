'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/locale';
import { reportClientError } from '@/lib/report-error';
import { Button, Card } from './ui';

/** One language's wording for the fallback (catalog namespace errors.page). */
export interface FallbackText {
  lang: Locale;
  title: string;
  body: string;
  reference: string;
  retry: string;
  home: string;
}

/**
 * The root boundary replaces the whole document, outside the layout's
 * translation provider and before any language is known, so it says
 * everything in both languages. These are the catalogs' errors.page words;
 * error-fallback.test.tsx keeps them equal. Kept here instead of importing
 * both catalogs, which would ship every message to every visitor.
 */
export const GLOBAL_ERROR_TEXT: readonly FallbackText[] = [
  {
    lang: 'en',
    title: 'Something went wrong',
    body: 'This page hit an unexpected error. Try again, or go back to the home page.',
    reference: 'Reference',
    retry: 'Try again',
    home: 'Home',
  },
  {
    lang: 'bn',
    title: 'কিছু একটা সমস্যা হয়েছে',
    body: 'পাতাটিতে অপ্রত্যাশিত একটি সমস্যা হয়েছে। আবার চেষ্টা করুন, অথবা প্রথম পাতায় ফিরে যান।',
    reference: 'রেফারেন্স',
    retry: 'আবার চেষ্টা করুন',
    home: 'প্রথম পাতা',
  },
];

/** The fallback's wording in the reader's language, for boundaries inside the layout. */
export function useFallbackText(): FallbackText {
  const t = useTranslations('errors.page');
  return {
    lang: useLocale(),
    title: t('title'),
    body: t('body'),
    reference: t('reference'),
    retry: t('retry'),
    home: t('home'),
  };
}

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

/**
 * Shared UI for the route and root error boundaries (app/error.tsx,
 * app/global-error.tsx). With more than one wording, each block says it in
 * its own language and the buttons carry every language's label.
 */
export function ErrorFallback({
  error,
  retry,
  texts,
}: {
  error: unknown;
  retry: () => void;
  texts: readonly FallbackText[];
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  const digest = digestOf(error);
  const all = (pick: (text: FallbackText) => string) => texts.map(pick).join(' / ');
  const referenceLabel = `${all((text) => text.reference)}:`;

  return (
    <Card className="mx-auto w-full max-w-md text-center">
      <div role="alert">
        {texts.map((text, i) => (
          <div
            key={text.lang}
            lang={text.lang}
            className={i > 0 ? 'mt-4 border-t border-slate-200 pt-4' : undefined}
          >
            {i === 0 ? (
              <h1 className="text-lg font-semibold text-slate-900">{text.title}</h1>
            ) : (
              <p className="text-lg font-semibold text-slate-900">{text.title}</p>
            )}
            <p className="mt-2 text-sm text-slate-600">{text.body}</p>
          </div>
        ))}
        {digest && (
          <p className="mt-2 text-xs text-slate-500">
            {referenceLabel} <code>{digest}</code>
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>{all((text) => text.retry)}</Button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
        >
          {all((text) => text.home)}
        </Link>
      </div>
    </Card>
  );
}

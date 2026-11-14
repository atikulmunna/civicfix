import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { ApiError } from '@/lib/api';
import { messagesFor } from '@/test-utils';
import { EnglishOnly } from '@/components/english-only';
import { SERVER_TIME_ZONE, type Locale } from '@/i18n/locale';
import { useErrorMessage } from './use-error-message';

function word(error: unknown, locale: Locale, englishOnly = false): string {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider
      locale={locale}
      messages={messagesFor(locale)}
      timeZone={SERVER_TIME_ZONE}
    >
      {englishOnly ? <EnglishOnly>{children}</EnglishOnly> : children}
    </NextIntlClientProvider>
  );
  return renderHook(() => useErrorMessage(), { wrapper }).result.current(error, 'fallback text');
}

const bn = createTranslator({ locale: 'bn', messages: messagesFor('bn'), namespace: 'errors' });

const notFound = new ApiError('Report not found.', 'NOT_FOUND', 404, undefined, {
  messageKey: 'report.notFound',
});
const shortTitle = new ApiError(
  'Invalid request data.',
  'VALIDATION_ERROR',
  400,
  [
    { path: 'count', message: 'Invalid input: expected number' },
    {
      path: 'title',
      message: 'Title must be at least 3 characters.',
      messageKey: 'field.titleTooShort',
      messageParams: { min: 3 },
    },
  ],
  { messageKey: 'common.invalidRequest' },
);

describe('useErrorMessage (F5)', () => {
  it('shows what the server wrote, in English', () => {
    expect(word(notFound, 'en')).toBe('Report not found.');
  });

  it('words a keyed error from the catalog, in Bangla', () => {
    expect(word(notFound, 'bn')).toBe(bn('server.report.notFound'));
  });

  it('names the field problem rather than "invalid request", with Bangla digits', () => {
    expect(word(shortTitle, 'en')).toBe('Title must be at least 3 characters.');
    const text = word(shortTitle, 'bn');
    expect(text).toBe(bn('server.field.titleTooShort', { min: 3 }));
    expect(text).toContain('৩');
  });

  it('falls back to the code in Bangla when the server sent no key, never English', () => {
    const upload = new ApiError('Upload error: Unexpected field.', 'UPLOAD_FAILED', 400);
    expect(word(upload, 'en')).toBe('Upload error: Unexpected field.');
    expect(word(upload, 'bn')).toBe(bn('codes.UPLOAD_FAILED'));
    expect(word(upload, 'bn')).not.toMatch(/[A-Za-z]/);
    expect(word(new ApiError('Offline', 'NETWORK_ERROR', 0), 'bn')).toBe(bn('codes.NETWORK_ERROR'));
    expect(word(new ApiError('Odd', 'TEAPOT', 418), 'bn')).toBe(bn('codes.INTERNAL_ERROR'));
  });

  it('uses the fallback for anything that is not an API error', () => {
    expect(word(new Error('boom'), 'en')).toBe('fallback text');
    expect(word('boom', 'bn')).toBe('fallback text');
  });

  it('keeps staff pages English inside a Bangla session', () => {
    expect(word(notFound, 'bn', true)).toBe('Report not found.');
  });
});

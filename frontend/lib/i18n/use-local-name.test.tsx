import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { messagesFor } from '@/test-utils';
import { SERVER_TIME_ZONE, type Locale } from '@/i18n/locale';
import { useLocalName } from './use-local-name';

function nameIn(locale: Locale, item: { name: string; nameBn?: string | null }): string {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider
      locale={locale}
      messages={messagesFor(locale)}
      timeZone={SERVER_TIME_ZONE}
    >
      {children}
    </NextIntlClientProvider>
  );
  return renderHook(() => useLocalName(), { wrapper }).result.current(item);
}

describe('useLocalName (F5)', () => {
  it('uses the Bangla name in Bangla', () => {
    expect(nameIn('bn', { name: 'Street Lighting', nameBn: 'রাস্তার বাতি' })).toBe('রাস্তার বাতি');
  });

  it('falls back to the English name when there is no Bangla one', () => {
    expect(nameIn('bn', { name: 'Benches', nameBn: null })).toBe('Benches');
    expect(nameIn('bn', { name: 'Benches' })).toBe('Benches');
    expect(nameIn('bn', { name: 'Benches', nameBn: '' })).toBe('Benches');
  });

  it('uses the English name in English', () => {
    expect(nameIn('en', { name: 'Street Lighting', nameBn: 'রাস্তার বাতি' })).toBe(
      'Street Lighting',
    );
  });
});

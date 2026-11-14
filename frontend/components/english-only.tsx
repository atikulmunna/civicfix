import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { SERVER_TIME_ZONE } from '@/i18n/locale';
import { messagesFor } from '@/i18n/messages';

/**
 * Keeps a part of the app in English whatever the chosen language (F5): the
 * admin and department pages are not translated yet, so shared pieces inside
 * them (status badges, timelines) stay English too. `contents` keeps the
 * wrapper out of the layout; it only carries the language for screen readers.
 */
export function EnglishOnly({ children }: { children: ReactNode }) {
  return (
    <div lang="en" className="contents">
      <NextIntlClientProvider locale="en" messages={messagesFor('en')} timeZone={SERVER_TIME_ZONE}>
        {children}
      </NextIntlClientProvider>
    </div>
  );
}

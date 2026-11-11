import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { SERVER_TIME_ZONE, type Locale } from '@/i18n/locale';
import { messagesFor } from '@/i18n/messages';

export { messagesFor };

/** A fresh client per test: no retries (fail fast) and no cache shared between tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export interface IntlOptions {
  /** The interface language to render in (default English). */
  locale?: Locale;
}

function IntlProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messagesFor(locale)}
      timeZone={SERVER_TIME_ZONE}
    >
      {children}
    </NextIntlClientProvider>
  );
}

/** Render with translations, as the root layout provides them. */
export function renderWithIntl(ui: ReactElement, { locale = 'en' }: IntlOptions = {}) {
  return render(ui, {
    wrapper: ({ children }) => <IntlProvider locale={locale}>{children}</IntlProvider>,
  });
}

/** Render with translations and a QueryClientProvider, as the app's Providers do. */
export function renderWithQuery(
  ui: ReactElement,
  client: QueryClient = createTestQueryClient(),
  { locale = 'en' }: IntlOptions = {},
) {
  return {
    client,
    ...render(ui, {
      wrapper: ({ children }) => (
        <IntlProvider locale={locale}>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </IntlProvider>
      ),
    }),
  };
}

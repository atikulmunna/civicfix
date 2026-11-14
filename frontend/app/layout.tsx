import type { Metadata } from 'next';
import { Noto_Sans_Bengali } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import './globals.css';
import { Providers } from '@/components/providers';
import { Navbar } from '@/components/navbar';
import { PasswordResetBanner } from '@/components/password-reset-banner';

// Bangla letters: system fonts lack them, so the stack falls through to this
// one (app/globals.css), and Bangla looks the same on every device.
const bengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-bengali',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.meta');
  return { title: t('title'), description: t('description') };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`h-full antialiased ${bengali.variable}`}>
      <body className="min-h-full flex flex-col">
        {/* Inherits this request's language, messages and time zone (i18n/request.ts). */}
        <NextIntlClientProvider>
          <Providers>
            <Navbar />
            <PasswordResetBanner />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

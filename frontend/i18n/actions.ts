'use server';

import { cookies } from 'next/headers';
import { asLocale, LOCALE_COOKIE } from './locale';

const ONE_YEAR_S = 365 * 24 * 60 * 60;

/**
 * Remembers the chosen language on this device for a year (F5). The server
 * sets the cookie because Safari caps cookies written by page script at seven
 * days. A server action is a public endpoint, so only a known language is kept.
 */
export async function setLocale(value: string): Promise<void> {
  const locale = asLocale(value);
  if (!locale) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    maxAge: ONE_YEAR_S,
    path: '/',
    sameSite: 'lax',
  });
}

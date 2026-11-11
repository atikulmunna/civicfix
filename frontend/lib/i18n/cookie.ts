import { LOCALE_COOKIE, type Locale } from '@/i18n/locale';

/** Remember the language on this device for a year (read by i18n/request.ts). */
export function setLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

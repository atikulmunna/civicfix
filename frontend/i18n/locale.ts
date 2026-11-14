/**
 * Interface languages and how a request's language is chosen (F5): the
 * `locale` cookie set by the language switch, then the browser's
 * Accept-Language, then English.
 */
export const LOCALES = ['en', 'bn'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'locale';

/**
 * next-intl wants a time zone for anything it formats on the server. Pages
 * format dates in the browser, in the device's own zone (lib/i18n/use-format),
 * so nothing a person reads depends on this one.
 */
export const SERVER_TIME_ZONE = 'UTC';

/** A known locale (any letter case), or undefined. */
export function asLocale(value: string | undefined | null): Locale | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return LOCALES.find((l) => l === lower);
}

/** True when the header lists any Bangla tag with a quality above zero. */
function acceptsBangla(header: string | null): boolean {
  if (!header) return false;
  return header.split(',').some((part) => {
    const [tag = '', ...params] = part.split(';');
    if (tag.trim().toLowerCase().split('-')[0] !== 'bn') return false;
    const quality = params.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith('q='));
    if (quality === undefined) return true;
    const q = Number(quality.slice(2));
    return Number.isFinite(q) && q > 0;
  });
}

export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  return asLocale(cookie) ?? (acceptsBangla(acceptLanguage) ? 'bn' : DEFAULT_LOCALE);
}

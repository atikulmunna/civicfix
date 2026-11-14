import type { Locale } from './i18n/locale';
import type { Messages } from './i18n/messages';

// next-intl: type locales and message keys, so a wrong key fails the typecheck.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

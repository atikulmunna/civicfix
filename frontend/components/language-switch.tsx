'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { setLocaleCookie } from '@/lib/i18n/cookie';
import type { Locale } from '@/i18n/locale';
import { useAuth } from './auth-context';

/** Each language by its own name: the same in every language. */
const OWN_NAME: Record<Locale, string> = { en: 'English', bn: 'বাংলা' };

/**
 * Switches between Bangla and English (F5): remembered on this device and,
 * when signed in, on the account, then the page renders again in it.
 */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations('nav');
  const router = useRouter();
  const { user } = useAuth();
  const other: Locale = locale === 'bn' ? 'en' : 'bn';

  function choose() {
    setLocaleCookie(other);
    // Best effort: the device already keeps the choice if this fails.
    if (user) api.patch('/users/me', { language: other }).catch(() => undefined);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={choose}
      aria-label={t('switchTo')}
      className={`rounded-lg px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${className}`}
    >
      <span lang={other}>{OWN_NAME[other]}</span>
    </button>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth-context';

/**
 * Shown on every page while an admin-issued temporary password is in use
 * (user.mustChangePassword), until the user picks a new one. Hidden on the
 * account page, which shows the form itself.
 */
export function PasswordResetBanner() {
  const t = useTranslations('auth.banner');
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user?.mustChangePassword || pathname === '/me') return null;
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50">
      <p className="mx-auto max-w-7xl px-4 py-2 text-sm text-amber-900 sm:px-6">
        {t('text')}{' '}
        <Link href="/me#change-password" className="font-semibold underline">
          {t('link')}
        </Link>
      </p>
    </div>
  );
}

'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { isAdmin, isStaff, useAuth } from './auth-context';
import { Spinner } from './ui';

type Requirement = 'auth' | 'staff' | 'admin';

/**
 * Gate a page on authentication / role. Redirects unauthenticated users to
 * /login (preserving the intended path); shows a forbidden notice if the role
 * is insufficient.
 */
export function RequireAuth({
  require = 'auth',
  children,
}: {
  require?: Requirement;
  children: ReactNode;
}) {
  const t = useTranslations('auth.gate');
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) return <Spinner label={t('checking')} />;
  if (!user) return null;

  const allowed = require === 'auth' || (require === 'admin' ? isAdmin(user) : isStaff(user));
  if (!allowed) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">{t('deniedTitle')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('deniedBody')}</p>
      </div>
    );
  }
  return <>{children}</>;
}

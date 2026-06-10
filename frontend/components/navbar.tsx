'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { isAdmin, isStaff, useAuth } from './auth-context';
import { useToast } from './toast';

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 font-medium transition ${
        active ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  async function handleLogout() {
    await logout();
    toast('Signed out.', 'success');
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
          Civic<span className="text-teal-600">Fix</span>
        </Link>

        <div className="hidden items-center gap-1 text-sm text-slate-600 sm:flex">
          <NavLink href="/reports">Reports</NavLink>
          <NavLink href="/map">Map</NavLink>
          {user && <NavLink href="/reports/new">Report an issue</NavLink>}
          {isStaff(user) && <NavLink href="/department">My queue</NavLink>}
          {isAdmin(user) && <NavLink href="/admin">Admin</NavLink>}
        </div>

        <div className="ml-auto flex items-center gap-2 text-sm">
          {loading ? null : user ? (
            <>
              <Link
                href="/notifications"
                className="hidden rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 sm:inline"
              >
                Notifications
              </Link>
              <Link
                href="/me"
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-slate-700 transition hover:bg-slate-50"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-teal-400">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden font-medium sm:inline">{user.name.split(' ')[0]}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-slate-900 px-4 py-1.5 font-medium text-white transition hover:bg-slate-800"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

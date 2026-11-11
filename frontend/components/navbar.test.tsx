import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { messagesFor, renderWithIntl } from '@/test-utils';
import type { Locale } from '@/i18n/locale';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/scorecards',
}));
vi.mock('./auth-context', () => ({
  useAuth,
  isAdmin: (u: { role: string } | null) => u?.role === 'admin' || u?.role === 'super_admin',
  isStaff: (u: { role: string } | null) =>
    u?.role === 'admin' || u?.role === 'super_admin' || u?.role === 'department_worker',
}));
vi.mock('./toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { Navbar } from './navbar';

function sections(user: { name: string; role: string } | null, locale: Locale = 'en') {
  useAuth.mockReturnValue({ user, loading: false, logout: vi.fn() });
  renderWithIntl(<Navbar />, { locale });
  // The row for small screens (CSS shows one set of links at a time).
  const row = screen.getByRole('navigation', { name: messagesFor(locale).nav.sections });
  return within(row)
    .getAllByRole('link')
    .map((a) => a.textContent);
}

describe('Navbar on small screens', () => {
  it('gives signed-out visitors the public pages', () => {
    expect(sections(null)).toEqual(['Reports', 'Map', 'Scorecards']);
  });

  it('adds reporting for signed-in citizens', () => {
    expect(sections({ name: 'Rina', role: 'citizen' })).toEqual([
      'Reports',
      'Map',
      'Scorecards',
      'Report an issue',
    ]);
  });

  it('adds the queue and admin area for admins', () => {
    expect(sections({ name: 'Adam', role: 'admin' })).toEqual([
      'Reports',
      'Map',
      'Scorecards',
      'Report an issue',
      'My queue',
      'Admin',
    ]);
  });

  it('reads in Bangla, with a switch back to English', () => {
    const t = messagesFor('bn').nav;
    expect(sections({ name: 'Rina', role: 'citizen' }, 'bn')).toEqual([
      t.reports,
      t.map,
      t.scorecards,
      t.reportIssue,
    ]);
    const row = screen.getByRole('navigation', { name: t.sections });
    expect(within(row).getByRole('button', { name: t.switchTo })).toHaveTextContent('English');
  });
});

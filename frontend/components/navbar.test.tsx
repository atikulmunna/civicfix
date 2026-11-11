import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithIntl } from '@/test-utils';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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

function sections(user: { name: string; role: string } | null) {
  useAuth.mockReturnValue({ user, loading: false, logout: vi.fn() });
  renderWithIntl(<Navbar />);
  // The row for small screens (CSS shows one set of links at a time).
  const row = screen.getByRole('navigation', { name: 'Sections' });
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
});

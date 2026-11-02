import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/me/reports',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/components/auth-context';
import MyReportsPage from './page';

const ME = { id: 'u1', name: 'Me', email: 'me@e.com', role: 'citizen' };

describe('MyReportsPage', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('shows an error instead of the empty state when loading fails', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: ME });
      return Promise.reject(new ApiError('Service unavailable.', 'INTERNAL_ERROR', 503));
    });
    renderWithQuery(
      <AuthProvider>
        <MyReportsPage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.');
    expect(screen.queryByText(/haven’t reported anything/)).not.toBeInTheDocument();
  });
});

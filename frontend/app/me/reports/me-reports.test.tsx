import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';

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

describe('MyReportsPage in Bangla', () => {
  const bn = createTranslator({ locale: 'bn', messages: messagesFor('bn') });

  const report = (id: string) => ({
    id,
    title: `Report ${id}`,
    description: 'Water everywhere.',
    status: 'SUBMITTED',
    severity: 'high',
    createdAt: '2026-11-11T04:00:00.000Z',
    counts: { upvotes: 0, confirms: 0, falseReports: 0 },
    priorityScore: 0,
    images: [],
  });

  function serve(items: ReturnType<typeof report>[], total: number, totalPages: number) {
    get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: ME });
      return Promise.resolve({ items, page: 1, limit: 10, total, totalPages });
    });
    renderWithQuery(
      <AuthProvider>
        <MyReportsPage />
      </AuthProvider>,
      undefined,
      { locale: 'bn' },
    );
  }

  beforeEach(() => {
    get.mockReset();
  });

  it('pages through your reports in Bangla', async () => {
    serve([report('a'), report('b')], 12, 2);
    expect(
      await screen.findByText(bn('common.pageOf', { page: 1, pages: 2, total: 12 })),
    ).toHaveTextContent('১২');
    expect(screen.getByRole('heading', { name: bn('me.reports.title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: bn('common.previous') })).toBeDisabled();
    expect(screen.getByRole('button', { name: bn('common.next') })).toBeEnabled();
  });

  it('invites a first report in Bangla when there are none', async () => {
    serve([], 0, 0);
    const empty = bn.markup('me.reports.empty', { link: (chunks) => chunks });
    expect(
      await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === empty),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: bn('nav.reportIssue') })).toHaveLength(2);
  });
});

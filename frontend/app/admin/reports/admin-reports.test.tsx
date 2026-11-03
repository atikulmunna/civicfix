import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/reports',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import AdminReportsPage from './page';

const report = (id: string, title: string, status: string, priorityScore: number) => ({
  id,
  userId: 'u1',
  title,
  description: 'Details.',
  categoryId: 'c1',
  status,
  severity: 'high',
  latitude: 23.8,
  longitude: 90.4,
  address: null,
  landmark: null,
  assignedDepartmentId: null,
  priorityScore,
  duplicateOfReportId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  resolvedAt: null,
});

const listCalls = () =>
  get.mock.calls
    .filter(([path]) => path === '/admin/reports')
    .map(([, params]) => params as { sort?: string });

describe('admin reports queue', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: { id: 'a1', role: 'admin' } });
      if (path === '/categories') return Promise.resolve({ categories: [] });
      if (path === '/admin/reports') {
        return Promise.resolve({
          items: [
            report('r1', 'Collapsed drain cover', 'VERIFIED', 55),
            report('r2', 'Fixed streetlight', 'RESOLVED', 0),
          ],
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
        });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  });

  function renderQueue() {
    renderWithQuery(
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={null}>
            <AdminReportsPage />
          </Suspense>
        </AuthProvider>
      </ToastProvider>,
    );
  }

  it("asks for the most urgent first and shows each open report's priority", async () => {
    renderQueue();

    expect(await screen.findByText('Collapsed drain cover')).toBeInTheDocument();
    expect(listCalls()[0]).toMatchObject({ sort: 'priority' });
    expect(screen.getByText('Priority 55')).toBeInTheDocument();
    // Closed reports score 0 and show no chip.
    expect(screen.getAllByText(/^Priority \d+$/)).toHaveLength(1);
  });

  it('can sort by date instead', async () => {
    renderQueue();
    await screen.findByText('Collapsed drain cover');

    await userEvent.setup().selectOptions(screen.getByLabelText('Sort'), 'newest');
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ sort: 'newest' }));
  });
});

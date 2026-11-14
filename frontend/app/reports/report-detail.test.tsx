import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { messagesFor, renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/i18n/time-zone', () => ({ deviceTimeZone: () => 'Asia/Dhaka' }));

import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import { ReportDetail } from './[id]/page';

const report = {
  id: 'r1',
  userId: 'u1',
  title: 'Pothole on 5th',
  description: 'A big pothole.',
  categoryId: 'c1',
  status: 'SUBMITTED',
  severity: 'high',
  latitude: 23.8,
  longitude: 90.4,
  address: null,
  landmark: null,
  assignedDepartmentId: null,
  priorityScore: 0,
  duplicateOfReportId: null,
  createdAt: '2026-11-11T04:00:00.000Z',
  updatedAt: '2026-11-11T04:00:00.000Z',
  resolvedAt: null,
  images: [
    {
      id: 'i1',
      imageUrl: '/uploads/i1.webp',
      imageType: 'evidence',
      createdAt: '2026-11-11T04:00:00.000Z',
    },
  ],
  counts: { upvotes: 0, confirms: 0, falseReports: 0 },
};

function render(failing?: string) {
  get.mockImplementation((path: string) => {
    if (path === failing)
      return Promise.reject(new ApiError('Service down.', 'INTERNAL_ERROR', 503));
    if (path === '/auth/me') return Promise.reject(new ApiError('Sign in.', 'AUTH_REQUIRED', 401));
    if (path === '/reports/r1') return Promise.resolve({ report });
    if (path === '/reports/r1/history') return Promise.resolve({ history: [] });
    if (path === '/reports/r1/comments') return Promise.resolve({ comments: [] });
    if (path === '/reports/r1/recurrence')
      return Promise.resolve({ radiusM: 150, total: 0, earlier: [] });
    if (path === '/reports/r1/fix-checks')
      return Promise.resolve({ disputesToReopen: 2, current: null, checks: [], total: 0 });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
  renderWithQuery(
    <ToastProvider>
      <AuthProvider>
        <ReportDetail id="r1" />
      </AuthProvider>
    </ToastProvider>,
    undefined,
    { locale: 'bn' },
  );
}

describe('ReportDetail in Bangla', () => {
  const t = messagesFor('bn').report;

  beforeEach(() => {
    get.mockReset();
  });

  it('frames the report in Bangla and leaves its own words alone', async () => {
    render();
    expect(await screen.findByRole('heading', { name: 'Pothole on 5th' })).toBeInTheDocument();
    expect(screen.getByText('A big pothole.')).toBeInTheDocument();
    const reported = screen.getByText(/১১ নভেম্বর/);
    expect(reported.textContent).not.toMatch(/[A-Za-z0-9]/);
    expect(screen.getByRole('img', { name: t.photo.evidence })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.historyHeading })).toBeInTheDocument();
  });

  it("keeps the API's own message when the report fails to load", async () => {
    render('/reports/r1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Service down.');
  });
});

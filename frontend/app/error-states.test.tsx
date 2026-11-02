/**
 * R9: every screen moved to TanStack Query shows the API's error instead of
 * an empty state when its data fails to load (frontend rule: never swallow an
 * error into an empty state).
 */
import { Suspense, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import { CommentSection } from '@/components/comment-section';
import NotificationsPage from './notifications/page';
import DepartmentPage from './department/page';
import AnalyticsPage from './admin/analytics/page';
import { ReportDetail } from './reports/[id]/page';

const OUTAGE = 'Service unavailable.';

/** Signed in as `role`; the request to `failing` fails, everything else is empty. */
function render(ui: ReactElement, role: string, failing: string) {
  get.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve({ user: { id: 'u1', name: 'U', role } });
    if (path === failing) return Promise.reject(new ApiError(OUTAGE, 'INTERNAL_ERROR', 503));
    return Promise.resolve({ items: [], comments: [], history: [], categories: [] });
  });
  return renderWithQuery(
    <ToastProvider>
      <AuthProvider>
        <Suspense fallback={null}>{ui}</Suspense>
      </AuthProvider>
    </ToastProvider>,
  );
}

const cases: [string, ReactElement, string, string][] = [
  ['notifications', <NotificationsPage key="n" />, 'citizen', '/notifications'],
  ['department queue', <DepartmentPage key="d" />, 'department_worker', '/department/reports'],
  ['analytics', <AnalyticsPage key="a" />, 'admin', '/admin/analytics/categories'],
  ['report detail', <ReportDetail key="r" id="r1" />, 'citizen', '/reports/r1'],
  ['comments', <CommentSection key="c" reportId="r1" />, 'citizen', '/reports/r1/comments'],
];

describe('error states', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it.each(cases)(
    '%s shows the API error instead of an empty state',
    async (_name, ui, role, failing) => {
      render(ui, role, failing);
      expect(await screen.findByRole('alert')).toHaveTextContent(OUTAGE);
    },
  );
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '@/test-utils';
import userEvent from '@testing-library/user-event';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, patch } };
});

import { ToastProvider } from '@/components/toast';
import { EnglishOnly } from '@/components/english-only';
import { Moderation } from './page';

const report = {
  id: 'r1',
  userId: 'u9',
  title: 'Broken light',
  description: 'Out for days.',
  categoryId: 'c1',
  category: { id: 'c1', name: 'Lighting' },
  status: 'SUBMITTED',
  severity: 'high',
  latitude: 1,
  longitude: 1,
  address: '1 St',
  landmark: null,
  assignedDepartmentId: null,
  priorityScore: 0,
  duplicateOfReportId: null,
  internalNote: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolvedAt: null,
  images: [],
};

describe('Moderation panel', () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset().mockResolvedValue({ report });
    get.mockImplementation((path: string) => {
      if (path === '/reports/r1') return Promise.resolve({ report });
      if (path === '/reports/r1/history') return Promise.resolve({ history: [] });
      if (path === '/departments')
        return Promise.resolve({ departments: [{ id: 'd1', name: 'Public Works' }] });
      if (path === '/admin/reports/r1/priority') return Promise.resolve({ priority: null });
      if (path === '/admin/reports/r1/duplicate-candidates')
        return Promise.resolve({ radiusM: 200, candidates: [] });
      return Promise.resolve({});
    });
  });

  it('applies a status transition via PATCH', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ToastProvider>
        <Moderation id="r1" />
      </ToastProvider>,
    );

    await screen.findByText('Broken light');
    await user.selectOptions(screen.getByLabelText('New status'), 'UNDER_REVIEW');
    await user.click(screen.getByRole('button', { name: /apply status/i }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/admin/reports/r1/status',
        expect.objectContaining({ status: 'UNDER_REVIEW' }),
      ),
    );
  });

  it('stays English inside a Bangla page, its date and status names included', async () => {
    renderWithQuery(
      <ToastProvider>
        <EnglishOnly>
          <Moderation id="r1" />
        </EnglishOnly>
      </ToastProvider>,
      undefined,
      { locale: 'bn' },
    );
    // English in any English order (the old helper followed the machine's locale).
    const reported = await screen.findByText(/^Reported /);
    expect(reported.textContent).toMatch(/\d{4}/);
    expect(reported.textContent).not.toMatch(/[\u0980-\u09FF]/);
    expect(screen.getByRole('option', { name: 'Under Review' })).toBeInTheDocument();
  });
});

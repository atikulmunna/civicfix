import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import ReportsPage from './page';
import type { Report } from '@/lib/types';

function makeReport(over: Partial<Report> = {}): Report {
  return {
    id: 'r1', userId: 'u1', title: 'Pothole on 5th', description: 'A big pothole.',
    categoryId: 'c1', category: { id: 'c1', name: 'Roads' }, status: 'SUBMITTED', severity: 'high',
    latitude: 1, longitude: 1, address: '5th Ave', landmark: null, assignedDepartmentId: null,
    priorityScore: 0, duplicateOfReportId: null, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), resolvedAt: null, images: [],
    counts: { upvotes: 2, confirms: 1, falseReports: 0 }, ...over,
  };
}

describe('ReportsPage', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((path: string) => {
      if (path === '/categories') return Promise.resolve({ categories: [{ id: 'c1', name: 'Roads' }] });
      return Promise.resolve({ items: [makeReport()], page: 1, limit: 10, total: 1, totalPages: 1 });
    });
  });

  it('renders reports from the API', async () => {
    render(<ReportsPage />);
    expect(await screen.findByText('Pothole on 5th')).toBeInTheDocument();
    expect(screen.getByText('A big pothole.')).toBeInTheDocument();
  });

  it('refetches with a status filter when changed', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await screen.findByText('Pothole on 5th');

    await user.selectOptions(screen.getByLabelText('Status'), 'RESOLVED');

    await waitFor(() => {
      const reportCalls = get.mock.calls.filter((c) => c[0] === '/reports');
      const last = reportCalls.at(-1);
      expect(last?.[1]).toMatchObject({ status: 'RESOLVED', page: 1 });
    });
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { messagesFor, renderWithQuery } from '@/test-utils';
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
    id: 'r1',
    userId: 'u1',
    title: 'Pothole on 5th',
    description: 'A big pothole.',
    categoryId: 'c1',
    category: { id: 'c1', name: 'Roads', icon: null },
    status: 'SUBMITTED',
    severity: 'high',
    latitude: 1,
    longitude: 1,
    address: '5th Ave',
    landmark: null,
    assignedDepartmentId: null,
    priorityScore: 0,
    duplicateOfReportId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    images: [],
    counts: { upvotes: 2, confirms: 1, falseReports: 0 },
    ...over,
  };
}

describe('ReportsPage', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation((path: string) => {
      if (path === '/categories')
        return Promise.resolve({ categories: [{ id: 'c1', name: 'Roads' }] });
      return Promise.resolve({
        items: [makeReport()],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  it('renders reports from the API', async () => {
    renderWithQuery(<ReportsPage />);
    expect(await screen.findByText('Pothole on 5th')).toBeInTheDocument();
    expect(screen.getByText('A big pothole.')).toBeInTheDocument();
  });

  it('refetches with a status filter when changed', async () => {
    const user = userEvent.setup();
    renderWithQuery(<ReportsPage />);
    await screen.findByText('Pothole on 5th');

    await user.selectOptions(screen.getByLabelText('Status'), 'RESOLVED');

    await waitFor(() => {
      const reportCalls = get.mock.calls.filter((c) => c[0] === '/reports');
      const last = reportCalls.at(-1);
      expect(last?.[1]).toMatchObject({ status: 'RESOLVED', page: 1 });
    });
  });
});

describe('ReportsPage in Bangla', () => {
  const t = messagesFor('bn').reports;
  const paging = messagesFor('bn').common;

  it('labels its filters, sorts and pages in Bangla', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/categories')
        return Promise.resolve({ categories: [{ id: 'c1', name: 'Roads' }] });
      return Promise.resolve({
        items: [makeReport()],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
    renderWithQuery(<ReportsPage />, undefined, { locale: 'bn' });
    expect(await screen.findByText('Pothole on 5th')).toBeInTheDocument();
    expect(screen.getByLabelText(t.search)).toHaveAttribute('placeholder', t.searchPlaceholder);
    expect(screen.getByRole('option', { name: t.allStatuses })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: t.sorts.most_confirmed })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: paging.next })).toBeInTheDocument();
    const pager = screen.getByRole('button', { name: paging.next }).closest('div')!.parentElement!;
    expect(pager.firstElementChild?.textContent).not.toMatch(/[A-Za-z0-9]/);
  });

  it('says so in Bangla when nothing matches', async () => {
    get.mockImplementation((path: string) =>
      path === '/categories'
        ? Promise.resolve({ categories: [] })
        : Promise.resolve({ items: [], page: 1, limit: 10, total: 0, totalPages: 0 }),
    );
    renderWithQuery(<ReportsPage />, undefined, { locale: 'bn' });
    expect(await screen.findByText(t.none)).toBeInTheDocument();
  });
});

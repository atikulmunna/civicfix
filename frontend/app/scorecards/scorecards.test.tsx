import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';
import type { Locale } from '@/i18n/locale';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { ApiError } from '@/lib/api';
import type { DepartmentScorecard } from '@/lib/types';
import ScorecardsPage from './page';

const targets = {
  response: { urgent: 24, high: 48, medium: 120, low: 240 },
  resolution: { urgent: 72, high: 168, medium: 336, low: 720 },
};

function card(over: Partial<DepartmentScorecard>): DepartmentScorecard {
  return {
    departmentId: 'd1',
    name: 'Public Works',
    assigned: 0,
    resolved: 0,
    resolutionRate: null,
    medianResponseHours: null,
    medianResolveHours: null,
    respondedOnTimeRate: null,
    resolvedOnTimeRate: null,
    overdueCount: 0,
    overdue: [],
    ...over,
  };
}

const overdue = (reportId: string, title: string, hoursOverdue: number) => ({
  reportId,
  title,
  severity: 'high' as const,
  status: 'ASSIGNED' as const,
  assignedAt: '2026-10-01T00:00:00.000Z',
  dueAt: '2026-10-08T00:00:00.000Z',
  hoursOverdue,
});

function renderWith(departments: DepartmentScorecard[], locale: Locale = 'en') {
  get.mockResolvedValue({
    generatedAt: '2026-11-05T00:00:00.000Z',
    windowDays: 90,
    targets,
    departments,
  });
  renderWithQuery(<ScorecardsPage />, undefined, { locale });
}

describe('department scorecards page', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('says how many reports are overdue, from the true counts', async () => {
    renderWith([
      card({ departmentId: 'a', name: 'Roads', overdueCount: 80, overdue: [] }),
      card({ departmentId: 'b', name: 'Water', overdueCount: 3, overdue: [] }),
    ]);
    expect(
      await screen.findByText('83 reports are past their resolution target right now.'),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/scorecards', undefined, expect.anything());
  });

  it('uses the singular for one report', async () => {
    renderWith([card({ overdueCount: 1, overdue: [overdue('r1', 'Blocked drain', 72)] })]);
    expect(
      await screen.findByText('1 report is past its resolution target right now.'),
    ).toBeInTheDocument();
  });

  it('says plainly when nothing is overdue and lists no overdue section', async () => {
    renderWith([card({})]);
    expect(
      await screen.findByText('No report is past its resolution target right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Overdue reports' })).toBeNull();
  });

  it('lists departments worst first, then by name', async () => {
    renderWith([
      card({ departmentId: 'a', name: 'Water' }),
      card({ departmentId: 'b', name: 'Roads', overdueCount: 2 }),
      card({ departmentId: 'c', name: 'Parks' }),
    ]);
    const table = await screen.findByRole('region', { name: 'Scores by department' });
    const names = within(table)
      .getAllByRole('rowheader')
      .map((h) => h.textContent);
    expect(names).toEqual(['Roads', 'Parks', 'Water']);
  });

  it('shows the measures, and "No data" rather than zero where nothing was measured', async () => {
    renderWith([
      card({
        departmentId: 'a',
        name: 'Roads',
        assigned: 12,
        resolved: 7,
        resolutionRate: 0.5833,
        respondedOnTimeRate: 0.75,
        resolvedOnTimeRate: 0.5,
        medianResponseHours: 5.2,
        medianResolveHours: 96,
      }),
      card({ departmentId: 'b', name: 'Water' }),
    ]);
    const row = await screen.findByRole('row', { name: /Roads/ });
    for (const text of ['58%', '7 of 12 assigned', '75%', '50%', '5 hours', '4 days']) {
      expect(within(row).getByText(text)).toBeInTheDocument();
    }
    const empty = screen.getByRole('row', { name: /Water/ });
    expect(within(empty).getAllByText('No data')).toHaveLength(5);
    expect(within(empty).queryByText('0%')).toBeNull();
  });

  it('links overdue reports and says when the list is only the worst of them', async () => {
    renderWith([
      card({
        name: 'Roads',
        overdueCount: 80,
        overdue: [overdue('r1', 'Blocked drain', 72), overdue('r2', 'Open manhole', 5)],
      }),
    ]);
    expect(await screen.findByRole('link', { name: 'Blocked drain' })).toHaveAttribute(
      'href',
      '/reports/r1',
    );
    expect(screen.getByText('3 days over target')).toBeInTheDocument();
    expect(screen.getByText('5 hours over target')).toBeInTheDocument();
    expect(screen.getByText('Showing the 2 most overdue of 80.')).toBeInTheDocument();
  });

  it('publishes the targets it scores against', async () => {
    renderWith([card({})]);
    const urgent = await screen.findByRole('row', { name: /^Urgent/ });
    expect(within(urgent).getByText('1 day')).toBeInTheDocument();
    expect(within(urgent).getByText('3 days')).toBeInTheDocument();
    expect(screen.getByText(/assigned in the last 90 days/)).toBeInTheDocument();
    expect(screen.getByText(/counts as unresolved again/)).toBeInTheDocument();
  });

  it('shows the API error instead of an empty page', async () => {
    get.mockRejectedValue(new ApiError('Service unavailable.', 'INTERNAL_ERROR', 503));
    renderWithQuery(<ScorecardsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.');
  });

  it('explains an empty page when there are no departments', async () => {
    renderWith([]);
    expect(
      await screen.findByText('Scorecards appear here once departments are set up.'),
    ).toBeInTheDocument();
  });
});

describe('department scorecards page in Bangla', () => {
  const bn = createTranslator({
    locale: 'bn',
    messages: messagesFor('bn'),
    namespace: 'scorecards',
  });

  beforeEach(() => {
    get.mockReset();
  });

  it('says how many reports are overdue, one or many', async () => {
    renderWith([card({ overdueCount: 3 })], 'bn');
    expect(await screen.findByText(bn('statement', { count: 3 }))).toBeInTheDocument();
  });

  it('says so when nothing is overdue', async () => {
    renderWith([card({})], 'bn');
    expect(await screen.findByText(bn('statement', { count: 0 }))).toBeInTheDocument();
  });

  it('shows measures with Bangla digits, and Bangla "No data"', async () => {
    renderWith(
      [
        card({
          departmentId: 'a',
          name: 'Roads',
          assigned: 12,
          resolved: 7,
          resolutionRate: 0.5833,
          medianResolveHours: 96,
        }),
        card({ departmentId: 'b', name: 'Water' }),
      ],
      'bn',
    );
    const row = await screen.findByRole('row', { name: /Roads/ });
    expect(within(row).getByText('৫৮%')).toBeInTheDocument();
    expect(within(row).getByText(/৪/)).toBeInTheDocument();
    const empty = screen.getByRole('row', { name: /Water/ });
    expect(within(empty).getAllByText(bn('noData'))).toHaveLength(5);
    expect(screen.getByRole('region', { name: bn('region') })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: bn('method.heading') })).toBeInTheDocument();
  });
});

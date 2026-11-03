import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { ApiError } from '@/lib/api';
import { formatPoints, PriorityCard } from './priority-card';

const explanation = {
  severity: 35,
  confirmations: 12,
  waiting: 9,
  flags: -5,
  reporter: 4,
  total: 55,
  daysOpen: 9,
  inputs: { severity: 'high', confirms: 6, falseReports: 1, reporterTrust: 20 },
};

describe('PriorityCard', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('shows each part of the score with its input, and the total', async () => {
    get.mockResolvedValue({ priority: explanation });
    renderWithQuery(<PriorityCard reportId="r1" />);

    expect(await screen.findByTestId('priority-total')).toHaveTextContent('55');
    expect(get).toHaveBeenCalledWith('/admin/reports/r1/priority', undefined, expect.anything());
    const row = (name: RegExp) => screen.getByRole('row', { name });
    expect(within(row(/Severity \(High\)/)).getByText('+35')).toBeInTheDocument();
    expect(within(row(/Confirmations \(6\)/)).getByText('+12')).toBeInTheDocument();
    expect(within(row(/Days open \(9\)/)).getByText('+9')).toBeInTheDocument();
    expect(within(row(/False-report flags \(1\)/)).getByText('-5')).toBeInTheDocument();
    expect(within(row(/Reporter trust \(\+20\)/)).getByText('+4')).toBeInTheDocument();
  });

  it('explains that a closed report is not ranked', async () => {
    get.mockResolvedValue({ priority: null });
    renderWithQuery(<PriorityCard reportId="r1" />);
    expect(await screen.findByText(/Closed reports are not ranked/)).toBeInTheDocument();
  });

  it('shows the API error instead of a score', async () => {
    get.mockRejectedValue(new ApiError('Forbidden.', 'FORBIDDEN', 403));
    renderWithQuery(<PriorityCard reportId="r1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden.');
  });
});

describe('formatPoints', () => {
  it('signs positive points and leaves zero and negatives as they are', () => {
    expect([formatPoints(12), formatPoints(0), formatPoints(-5)]).toEqual(['+12', '0', '-5']);
  });
});

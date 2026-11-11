import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { messagesFor, renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Recurrence } from '@/lib/types';
import { RecurrenceNote } from './recurrence-note';

const earlier = (id: string, title: string) => ({
  id,
  title,
  status: 'RESOLVED' as const,
  resolvedAt: '2026-10-12T10:00:00.000Z',
  distanceM: 90,
});

describe('RecurrenceNote', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('names the earlier fixes when the problem came back', async () => {
    get.mockResolvedValue({
      radiusM: 150,
      total: 2,
      earlier: [earlier('e1', 'Blocked drain'), earlier('e2', 'Drain overflowing')],
    } satisfies Recurrence);
    renderWithQuery(<RecurrenceNote reportId="r1" />);

    expect(
      await screen.findByRole('heading', { name: 'This problem has come back' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 earlier reports of the same kind within 150 m were fixed before this one was made.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Blocked drain' })).toHaveAttribute(
      'href',
      '/reports/e1',
    );
    expect(screen.getAllByText(/m away/)[0]).toHaveTextContent('90 m away');
    expect(get).toHaveBeenCalledWith('/reports/r1/recurrence', undefined, expect.anything());
  });

  it('uses the singular for one earlier fix, and says when the list is cut short', async () => {
    get.mockResolvedValue({ radiusM: 150, total: 12, earlier: [earlier('e1', 'Blocked drain')] });
    renderWithQuery(<RecurrenceNote reportId="r1" />);
    expect(await screen.findByText('Showing the 1 most recently fixed.')).toBeInTheDocument();

    get.mockResolvedValue({ radiusM: 150, total: 1, earlier: [earlier('e1', 'Blocked drain')] });
    renderWithQuery(<RecurrenceNote reportId="r2" />);
    expect(
      await screen.findByText(
        'An earlier report of the same kind within 150 m was fixed before this one was made.',
      ),
    ).toBeInTheDocument();
  });

  it('says nothing when nothing was fixed here before', async () => {
    get.mockResolvedValue({ radiusM: 150, total: 0, earlier: [] });
    const { client } = renderWithQuery(<RecurrenceNote reportId="r1" />);
    await waitFor(() =>
      expect(client.getQueryState(queryKeys.recurrence('r1'))?.status).toBe('success'),
    );
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('shows a failure rather than staying silent', async () => {
    get.mockRejectedValue(new ApiError('Service unavailable.', 'INTERNAL_ERROR', 503));
    renderWithQuery(<RecurrenceNote reportId="r1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.');
  });
});

describe('RecurrenceNote in Bangla', () => {
  it('reads in Bangla with Bangla digits', async () => {
    get.mockResolvedValue({ radiusM: 150, total: 1, earlier: [earlier('e1', 'Blocked drain')] });
    renderWithQuery(<RecurrenceNote reportId="r1" />, undefined, { locale: 'bn' });
    expect(
      await screen.findByRole('heading', { name: messagesFor('bn').recurrence.heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Blocked drain' }).closest('li')).toHaveTextContent(
      '৯০',
    );
  });
});

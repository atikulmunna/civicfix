import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Report } from '@/lib/types';
import { MergedNotice } from '../merged-notice';
import { DuplicateMerge } from './duplicate-merge';

const report = (over: Partial<Report>): Report => ({
  id: 'r1',
  userId: 'u1',
  title: 'Street light not working',
  description: 'Dark all night.',
  categoryId: 'c1',
  status: 'SUBMITTED',
  severity: 'medium',
  latitude: 23.8,
  longitude: 90.4,
  address: null,
  landmark: null,
  assignedDepartmentId: null,
  priorityScore: 0,
  duplicateOfReportId: null,
  createdAt: '2026-11-08T10:00:00.000Z',
  updatedAt: '2026-11-08T10:00:00.000Z',
  resolvedAt: null,
  ...over,
});

const candidate = (id: string, title: string, distanceM: number) =>
  report({ id, title, distanceM, createdAt: '2026-11-01T10:00:00.000Z' });

function setup(subject: Report, onMerge = vi.fn(), busy = false) {
  renderWithQuery(<DuplicateMerge report={subject} busy={busy} onMerge={onMerge} />);
  return onMerge;
}

describe('DuplicateMerge', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('offers likely originals and merges only after confirming', async () => {
    get.mockResolvedValue({
      radiusM: 200,
      candidates: [
        candidate('o1', 'Lamp out by the mosque', 48),
        candidate('o2', 'Dark lane', 150),
      ],
    });
    const onMerge = setup(report({}));
    const user = userEvent.setup();

    const reported = formatDate('2026-11-01T10:00:00.000Z');
    expect(await screen.findByText(`48 m away, reported ${reported}`)).toBeInTheDocument();
    expect(screen.getByText(/within 200 m, made before this one/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      '/admin/reports/r1/duplicate-candidates',
      undefined,
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'Merge into "Lamp out by the mosque"' }));
    expect(onMerge).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Merge this report into "Lamp out by the mosque"\?/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm merge' }));
    expect(onMerge).toHaveBeenCalledWith('o1');
  });

  it('can back out of a merge', async () => {
    get.mockResolvedValue({ radiusM: 200, candidates: [candidate('o1', 'Dark lane', 60)] });
    const onMerge = setup(report({}));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Merge into "Dark lane"' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Merge into "Dark lane"' })).toBeInTheDocument();
    expect(onMerge).not.toHaveBeenCalled();
  });

  it('merges into a report given by its ID', async () => {
    get.mockResolvedValue({ radiusM: 200, candidates: [] });
    const onMerge = setup(report({}));
    const user = userEvent.setup();
    expect(await screen.findByText('None found.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Or merge into another report by its ID'), ' o9 ');
    await user.click(screen.getByRole('button', { name: 'Merge' }));
    expect(screen.getByText(/Merge this report into report o9\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm merge' }));
    expect(onMerge).toHaveBeenCalledWith('o9');
  });

  it('shows the API error instead of an empty list', async () => {
    get.mockRejectedValue(new ApiError('Service unavailable.', 'INTERNAL_ERROR', 503));
    setup(report({}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.');
  });

  it('stays out of the way once a report is past review', async () => {
    setup(report({ status: 'ASSIGNED' }));
    await waitFor(() => expect(get).not.toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Merge a duplicate' })).toBeNull();
  });

  it('links a merged report to its original', () => {
    setup(report({ status: 'DUPLICATE', duplicateOfReportId: 'o1' }));
    expect(screen.getByRole('link', { name: 'its original' })).toHaveAttribute(
      'href',
      '/admin/reports/o1',
    );
    expect(get).not.toHaveBeenCalled();
  });
});

describe('MergedNotice', () => {
  it('sends readers of a merged report to the original', () => {
    renderWithQuery(<MergedNotice originalId="o1" />);
    expect(screen.getByRole('link', { name: 'See the original report' })).toHaveAttribute(
      'href',
      '/reports/o1',
    );
  });
});

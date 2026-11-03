import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, renderWithQuery } from '@/test-utils';

const { post, del } = vi.hoisted(() => ({ post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, post, del } };
});
vi.mock('./auth-context', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'citizen' } }) }));

import { ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { VoteCounts } from '@/lib/types';
import { ToastProvider } from './toast';
import { VoteBar } from './vote-bar';

const counts = (upvotes: number): VoteCounts => ({ upvotes, confirms: 0, falseReports: 0 });

function setup() {
  const client = createTestQueryClient();
  client.setQueryData(queryKeys.report('r1'), { report: { id: 'r1', counts: counts(1) } });
  client.setQueryData(queryKeys.reports({ page: 1 }), { items: [] });
  client.setQueryData(queryKeys.myReports(1), { items: [] });
  renderWithQuery(
    <ToastProvider>
      <VoteBar reportId="r1" initialCounts={counts(1)} />
    </ToastProvider>,
    client,
  );
  return { client, user: userEvent.setup() };
}

describe('VoteBar', () => {
  beforeEach(() => {
    post.mockReset();
    del.mockReset();
  });

  it('keeps the cached report and every report list in step with a vote', async () => {
    post.mockResolvedValue({ counts: counts(2) });
    const { client, user } = setup();

    await user.click(screen.getByRole('button', { name: /upvote/i }));

    expect(await screen.findByRole('button', { name: /Upvote · 2/ })).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/reports/r1/upvote');
    expect(
      client.getQueryData<{ report: { counts: VoteCounts } }>(queryKeys.report('r1')),
    ).toMatchObject({ report: { counts: counts(2) } });
    expect(client.getQueryState(queryKeys.reports({ page: 1 }))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.myReports(1))?.isInvalidated).toBe(true);
  });

  it('undoes an upvote with DELETE', async () => {
    post.mockResolvedValue({ counts: counts(2) });
    del.mockResolvedValue({ counts: counts(1) });
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /upvote/i }));
    await user.click(await screen.findByRole('button', { name: /Upvote · 2/ }));

    expect(await screen.findByRole('button', { name: /Upvote · 1/ })).toBeInTheDocument();
    expect(del).toHaveBeenCalledWith('/reports/r1/upvote');
  });

  it('shows the follow state the server returns', async () => {
    post.mockResolvedValue({ following: true });
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Follow' }));

    expect(await screen.findByRole('button', { name: 'Following' })).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/reports/r1/follow');
  });

  it('shows why a vote failed and leaves the counts alone', async () => {
    post.mockRejectedValue(new ApiError('Report not found.', 'NOT_FOUND', 404));
    const { client, user } = setup();

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(await screen.findByText('Report not found.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm/i })).toBeEnabled());
    expect(client.getQueryState(queryKeys.reports({ page: 1 }))?.isInvalidated).toBe(false);
  });
});

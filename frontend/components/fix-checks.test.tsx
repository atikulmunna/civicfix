import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient, renderWithQuery } from '@/test-utils';

const { get, postForm, useAuth } = vi.hoisted(() => ({
  get: vi.fn(),
  postForm: vi.fn(),
  useAuth: vi.fn(),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, postForm } };
});
vi.mock('./auth-context', () => ({ useAuth }));

import { ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { FixCheck, FixChecks as FixChecksData } from '@/lib/types';
import { ToastProvider } from './toast';
import { FixChecks } from './fix-checks';

const FIX = '2026-11-04T10:00:00.000Z';
const CITIZEN = { id: 'u1', name: 'Rina', role: 'citizen' };

const check = (over: Partial<FixCheck>): FixCheck => ({
  id: 'c1',
  verdict: 'confirmed',
  imageUrl: '/uploads/c1.webp',
  author: { id: 'u2', name: 'Karim' },
  resolvedAt: FIX,
  createdAt: '2026-11-04T12:00:00.000Z',
  ...over,
});

function data(over: Partial<FixChecksData> = {}): FixChecksData {
  return {
    disputesToReopen: 2,
    current: { resolvedAt: FIX, confirmed: 0, disputed: 0 },
    checks: [],
    total: 0,
    viewer: { verdict: null, canCheck: true },
    ...over,
  };
}

function setup(response: FixChecksData, { resolved = true, user = CITIZEN as unknown } = {}) {
  useAuth.mockReturnValue({ user });
  get.mockResolvedValue(response);
  const client = createTestQueryClient();
  client.setQueryData(queryKeys.report('r1'), { report: { id: 'r1' } });
  return renderWithQuery(
    <ToastProvider>
      <FixChecks reportId="r1" resolved={resolved} />
    </ToastProvider>,
    client,
  );
}

const photo = () => new File(['photo bytes'], 'now.png', { type: 'image/png' });

describe('FixChecks', () => {
  beforeEach(() => {
    get.mockReset();
    postForm.mockReset();
  });

  it('asks a resident if it is fixed and sends a dispute with a photo', async () => {
    const user = userEvent.setup();
    setup(data());
    await user.click(await screen.findByRole('button', { name: 'No, still a problem' }));
    expect(screen.getByRole('button', { name: 'No, still a problem' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.upload(screen.getByLabelText('Photo of how it looks now'), photo());
    postForm.mockResolvedValue({ fixCheck: check({ verdict: 'disputed' }), reopened: false });
    await user.click(screen.getByRole('button', { name: 'Send dispute' }));

    await waitFor(() =>
      expect(postForm).toHaveBeenCalledWith('/reports/r1/fix-checks', expect.any(FormData)),
    );
    const form = postForm.mock.calls[0]?.[1] as FormData;
    expect(form.get('verdict')).toBe('disputed');
    expect((form.get('photo') as File).name).toBe('now.png');
    expect(await screen.findByText('Dispute sent. Thanks for checking.')).toBeInTheDocument();
    // The checks are fetched again to show the new one.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('asks for a photo before sending', async () => {
    const user = userEvent.setup();
    setup(data());
    await user.click(await screen.findByRole('button', { name: "Yes, it's fixed" }));
    await user.click(screen.getByRole('button', { name: 'Send confirmation' }));
    expect(screen.getByText('Add a photo of how it looks now.')).toBeInTheDocument();
    expect(postForm).not.toHaveBeenCalled();
  });

  it('says so when the dispute sends the report back, and refreshes the report', async () => {
    const user = userEvent.setup();
    const { client } = setup(data({ current: { resolvedAt: FIX, confirmed: 0, disputed: 1 } }));
    await user.click(await screen.findByRole('button', { name: 'No, still a problem' }));
    await user.upload(screen.getByLabelText('Photo of how it looks now'), photo());
    postForm.mockResolvedValue({ fixCheck: check({ verdict: 'disputed' }), reopened: true });
    await user.click(screen.getByRole('button', { name: 'Send dispute' }));
    expect(
      await screen.findByText(
        'Dispute sent. With 2 disputes, the report goes back to the department.',
      ),
    ).toBeInTheDocument();
    expect(client.getQueryState(queryKeys.report('r1'))?.isInvalidated).toBe(true);
  });

  it('shows the API refusal next to the form', async () => {
    const user = userEvent.setup();
    setup(data());
    await user.click(await screen.findByRole('button', { name: "Yes, it's fixed" }));
    await user.upload(screen.getByLabelText('Photo of how it looks now'), photo());
    postForm.mockRejectedValue(
      new ApiError('You have already checked this fix.', 'DUPLICATE_RESOURCE', 409),
    );
    await user.click(screen.getByRole('button', { name: 'Send confirmation' }));
    expect(await screen.findByText('You have already checked this fix.')).toBeInTheDocument();
  });

  it('shows the tally and your own check instead of the buttons', async () => {
    setup(
      data({
        current: { resolvedAt: FIX, confirmed: 2, disputed: 1 },
        viewer: { verdict: 'confirmed', canCheck: false },
      }),
    );
    expect(await screen.findByText('2 confirmed, 1 disputed')).toBeInTheDocument();
    expect(screen.getByText('You confirmed this fix.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Yes, it's fixed" })).toBeNull();
  });

  it('tells staff why they cannot check', async () => {
    setup(data({ viewer: { verdict: null, canCheck: false } }));
    expect(
      await screen.findByText(
        'Fixes are checked by residents, not by admins or the department that made them.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Yes, it's fixed" })).toBeNull();
  });

  it('invites signed-out visitors to sign in', async () => {
    // Signed out: the API sends no viewer part.
    const anonymous = data();
    delete anonymous.viewer;
    setup(anonymous, { user: null });
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('lists checks with their photos and marks those of an earlier fix', async () => {
    setup(
      data({
        checks: [
          check({ id: 'c2' }),
          check({
            id: 'c1',
            verdict: 'disputed',
            author: { id: 'u3', name: 'Mita' },
            resolvedAt: '2026-10-20T10:00:00.000Z',
          }),
        ],
        total: 2,
      }),
    );
    expect(await screen.findByText('Confirmed the fix')).toBeInTheDocument();
    expect(screen.getByText('Disputed the fix')).toBeInTheDocument();
    expect(screen.getAllByText(/of an earlier fix/)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Photo from Mita, open full size' })).toHaveAttribute(
      'href',
      expect.stringContaining('/uploads/c1.webp'),
    );
  });

  it('says when nobody has checked the fix yet', async () => {
    setup(data());
    expect(await screen.findByText('No one has checked this fix yet.')).toBeInTheDocument();
  });

  it('keeps the checks of a reopened report on show', async () => {
    setup(data({ current: null, checks: [check({ verdict: 'disputed' })], total: 1 }), {
      resolved: false,
    });
    expect(await screen.findByRole('heading', { name: 'Fix checks' })).toBeInTheDocument();
    expect(screen.getByText('Disputed the fix')).toBeInTheDocument();
    // No newer fix yet, so there is no "earlier" one to tell it apart from.
    expect(screen.queryByText(/of an earlier fix/)).toBeNull();
    expect(screen.queryByRole('button', { name: "Yes, it's fixed" })).toBeNull();
  });

  it('shows nothing for a report with no fix and no checks', async () => {
    const { client } = setup(data({ current: null }), { resolved: false });
    // Let the query settle before asserting there is still nothing.
    await waitFor(() =>
      expect(client.getQueryState(queryKeys.fixChecks('r1'))?.status).toBe('success'),
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/checked this fix/)).toBeNull();
  });

  it('shows the error rather than hiding the section', async () => {
    useAuth.mockReturnValue({ user: CITIZEN });
    get.mockRejectedValue(new ApiError('Service unavailable.', 'INTERNAL_ERROR', 503));
    renderWithQuery(
      <ToastProvider>
        <FixChecks reportId="r1" resolved />
      </ToastProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.');
  });
});

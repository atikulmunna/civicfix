import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test-utils';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post } };
});

import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from './auth-context';

const ME = { id: 'u1', name: 'Me', email: 'me@e.com', role: 'citizen' };

function Probe() {
  const { user, loading, logout } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p>{user ? `signed in as ${user.name}` : 'signed out'}</p>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset().mockResolvedValue({});
  });

  it('treats AUTH_REQUIRED from /auth/me as signed out', async () => {
    get.mockRejectedValue(new ApiError('Authentication required.', 'AUTH_REQUIRED', 401));
    renderWithQuery(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signed out')).toBeInTheDocument();
  });

  it('loads the current user and clears it on logout', async () => {
    get.mockResolvedValue({ user: ME });
    const user = userEvent.setup();
    renderWithQuery(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signed in as Me')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/logout'));
    expect(await screen.findByText('signed out')).toBeInTheDocument();
  });
});

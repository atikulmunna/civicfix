import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { push, post, get } = vi.hoisted(() => ({ push: vi.fn(), post: vi.fn(), get: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}));

// Mock the API client used by AuthProvider.
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post } };
});

import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import LoginPage from './page';

function renderLogin() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </ToastProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockClear();
    post.mockReset();
    get.mockRejectedValue(new Error('no session'));
  });

  it('submits credentials and redirects on success', async () => {
    post.mockResolvedValue({ user: { id: '1', name: 'Test', email: 't@e.com', role: 'citizen' } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 't@e.com');
    await user.type(screen.getByLabelText('Password'), 'CorrectHorse9');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/login', { email: 't@e.com', password: 'CorrectHorse9' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('shows the API error message on failure', async () => {
    post.mockRejectedValue(new ApiError('Invalid email or password.', 'VALIDATION_ERROR', 400));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 't@e.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

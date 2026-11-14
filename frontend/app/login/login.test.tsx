import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';
import type { Locale } from '@/i18n/locale';
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

function renderLogin(locale: Locale = 'en') {
  return renderWithQuery(
    <ToastProvider>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </ToastProvider>,
    undefined,
    { locale },
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

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/login', {
        email: 't@e.com',
        password: 'CorrectHorse9',
      }),
    );
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

  it('sends a user on a temporary password to change it first', async () => {
    post.mockResolvedValue({
      user: { id: '1', name: 'Test', email: 't@e.com', role: 'citizen', mustChangePassword: true },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 't@e.com');
    await user.type(screen.getByLabelText('Password'), 'Tmp-pass_1234567');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/me#change-password'));
  });
});

describe('LoginPage in Bangla', () => {
  const bn = createTranslator({ locale: 'bn', messages: messagesFor('bn'), namespace: 'auth' });

  beforeEach(() => {
    push.mockClear();
    post.mockReset();
    get.mockRejectedValue(new Error('no session'));
  });

  async function signIn(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(bn('fields.email')), 't@e.com');
    await user.type(screen.getByLabelText(bn('fields.password')), 'CorrectHorse9');
    await user.click(screen.getByRole('button', { name: bn('login.submit') }));
  }

  it('labels the form in Bangla and links to sign-up', () => {
    renderLogin('bn');
    expect(screen.getByRole('heading', { name: bn('login.title') })).toBeInTheDocument();
    expect(screen.getByText(bn('login.noAccount'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: bn('login.createOne') })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('confirms in Bangla once signed in', async () => {
    post.mockResolvedValue({ user: { id: '1', name: 'Test', email: 't@e.com', role: 'citizen' } });
    const user = userEvent.setup();
    renderLogin('bn');
    await signIn(user);
    expect(await screen.findByText(bn('login.signedIn'))).toBeInTheDocument();
  });

  it('says in Bangla when something unexpected fails, and shows API errors as sent', async () => {
    post.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    renderLogin('bn');
    await signIn(user);
    expect(await screen.findByText(bn('unexpected'))).toBeInTheDocument();

    post.mockRejectedValueOnce(new ApiError('Invalid email or password.', 'VALIDATION_ERROR', 400));
    await user.click(screen.getByRole('button', { name: bn('login.submit') }));
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });

  it('asks for the email and password in Bangla before calling the API', async () => {
    const user = userEvent.setup();
    renderLogin('bn');
    await user.click(screen.getByRole('button', { name: bn('login.submit') }));
    expect(await screen.findByText(bn('login.missing'))).toBeInTheDocument();
    await user.type(screen.getByLabelText(bn('fields.email')), 't@e.com');
    await user.click(screen.getByRole('button', { name: bn('login.submit') }));
    expect(await screen.findByText(bn('login.missing'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

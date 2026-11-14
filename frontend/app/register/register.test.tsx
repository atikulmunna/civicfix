import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';
import type { Locale } from '@/i18n/locale';

const { push, post, get } = vi.hoisted(() => ({ push: vi.fn(), post: vi.fn(), get: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/register',
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post } };
});

import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import RegisterPage from './page';

const NEW_USER = { id: '1', name: 'Rina', email: 'rina@e.com', role: 'citizen' };

function renderRegister(locale: Locale = 'en') {
  return renderWithQuery(
    <ToastProvider>
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    </ToastProvider>,
    undefined,
    { locale },
  );
}

beforeEach(() => {
  push.mockClear();
  post.mockReset();
  get.mockRejectedValue(new Error('no session'));
});

describe('RegisterPage', () => {
  it('creates the account, welcomes the resident and goes home', async () => {
    post.mockResolvedValue({ user: NEW_USER });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Name'), 'Rina');
    await user.type(screen.getByLabelText('Email'), 'rina@e.com');
    await user.type(screen.getByLabelText('Password'), 'CorrectHorse9');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/register', {
        name: 'Rina',
        email: 'rina@e.com',
        password: 'CorrectHorse9',
        phone: undefined,
      }),
    );
    expect(await screen.findByText('Account created. Welcome to CivicFix!')).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('shows the API error message as sent', async () => {
    post.mockRejectedValue(new ApiError('Email already registered.', 'CONFLICT', 409));
    const user = userEvent.setup();
    renderRegister();
    await user.type(screen.getByLabelText('Email'), 'rina@e.com');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Email already registered.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('RegisterPage in Bangla', () => {
  const bn = createTranslator({ locale: 'bn', messages: messagesFor('bn'), namespace: 'auth' });

  it('labels the form in Bangla, with the password rule in Bangla digits', () => {
    renderRegister('bn');
    expect(screen.getByRole('heading', { name: bn('register.title') })).toBeInTheDocument();
    for (const label of [
      bn('fields.name'),
      bn('fields.email'),
      bn('fields.password'),
      bn('fields.phone'),
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(bn('register.passwordHint', { min: 8 }))).toHaveTextContent('৮');
    expect(screen.getByRole('button', { name: bn('register.submit') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: bn('register.signIn') })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('welcomes the new resident in Bangla', async () => {
    post.mockResolvedValue({ user: NEW_USER });
    const user = userEvent.setup();
    renderRegister('bn');
    await user.type(screen.getByLabelText(bn('fields.name')), 'Rina');
    await user.type(screen.getByLabelText(bn('fields.email')), 'rina@e.com');
    await user.type(screen.getByLabelText(bn('fields.password')), 'CorrectHorse9');
    await user.click(screen.getByRole('button', { name: bn('register.submit') }));
    expect(await screen.findByText(bn('register.created'))).toBeInTheDocument();
  });

  it('says in Bangla when something unexpected fails', async () => {
    post.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderRegister('bn');
    await user.click(screen.getByRole('button', { name: bn('register.submit') }));
    expect(await screen.findByText(bn('unexpected'))).toBeInTheDocument();
  });
});

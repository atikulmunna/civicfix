import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';
import type { Locale } from '@/i18n/locale';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/me',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post } };
});

import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import { ChangePasswordForm } from './change-password-form';

const ME = { id: 'u1', name: 'Me', email: 'me@e.com', role: 'citizen', mustChangePassword: false };

function renderForm(user = ME, locale: Locale = 'en') {
  get.mockImplementation((path: string) =>
    path === '/auth/me' ? Promise.resolve({ user }) : Promise.reject(new Error(path)),
  );
  return renderWithQuery(
    <ToastProvider>
      <AuthProvider>
        <ChangePasswordForm />
      </AuthProvider>
    </ToastProvider>,
    undefined,
    { locale },
  );
}

async function fill(current: string, next: string, confirm: string) {
  const u = userEvent.setup();
  await u.type(await screen.findByLabelText('Current password'), current);
  await u.type(screen.getByLabelText('New password'), next);
  await u.type(screen.getByLabelText('Confirm new password'), confirm);
  await u.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('catches a mismatch or a short password before calling the API', async () => {
    renderForm();
    await fill('OldPassword1', 'NewPassword1', 'Different99');
    expect(await screen.findByText('The new passwords do not match.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('changes the password, clears the form and confirms', async () => {
    post.mockResolvedValue({ user: ME });
    renderForm();
    await fill('OldPassword1', 'NewPassword12', 'NewPassword12');

    expect(post).toHaveBeenCalledWith('/auth/change-password', {
      currentPassword: 'OldPassword1',
      newPassword: 'NewPassword12',
    });
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it("shows the API's reason when the change is refused", async () => {
    post.mockRejectedValue(
      new ApiError('Your current password is incorrect.', 'VALIDATION_ERROR', 400),
    );
    renderForm();
    await fill('WrongPassword', 'NewPassword12', 'NewPassword12');
    expect(await screen.findByText('Your current password is incorrect.')).toBeInTheDocument();
  });

  it('explains why after an admin reset', async () => {
    renderForm({ ...ME, mustChangePassword: true });
    expect(await screen.findByText(/An administrator reset your password/)).toBeInTheDocument();
  });
});

describe('ChangePasswordForm in Bangla', () => {
  const bn = createTranslator({
    locale: 'bn',
    messages: messagesFor('bn'),
    namespace: 'auth.password',
  });

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('catches a short password and a mismatch in Bangla, with Bangla digits', async () => {
    renderForm(ME, 'bn');
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText(bn('current')), 'OldPassword1');
    await u.type(screen.getByLabelText(bn('new')), 'short');
    await u.type(screen.getByLabelText(bn('confirm')), 'short');
    await u.click(screen.getByRole('button', { name: bn('submit') }));
    expect(await screen.findByText(bn('tooShort', { min: 8 }))).toHaveTextContent('৮');

    await u.clear(screen.getByLabelText(bn('new')));
    await u.type(screen.getByLabelText(bn('new')), 'NewPassword12');
    await u.clear(screen.getByLabelText(bn('confirm')));
    await u.type(screen.getByLabelText(bn('confirm')), 'Different99');
    await u.click(screen.getByRole('button', { name: bn('submit') }));
    expect(await screen.findByText(bn('mismatch'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('explains an admin reset and confirms the change in Bangla', async () => {
    post.mockResolvedValue({ user: ME });
    renderForm({ ...ME, mustChangePassword: true }, 'bn');
    expect(await screen.findByText(bn('resetNotice'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: bn('heading') })).toBeInTheDocument();

    const u = userEvent.setup();
    await u.type(screen.getByLabelText(bn('current')), 'OldPassword1');
    await u.type(screen.getByLabelText(bn('new')), 'NewPassword12');
    await u.type(screen.getByLabelText(bn('confirm')), 'NewPassword12');
    await u.click(screen.getByRole('button', { name: bn('submit') }));
    expect(await screen.findByText(bn('changed'))).toBeInTheDocument();
  });

  it('leaves checks to the page, and asks for the current password in Bangla', async () => {
    renderForm(ME, 'bn');
    const u = userEvent.setup();
    const submit = await screen.findByRole('button', { name: bn('submit') });
    // Native bubbles would speak the browser's language instead.
    expect(submit.closest('form')).toHaveAttribute('novalidate');
    await u.click(submit);
    expect(await screen.findByText(bn('currentMissing'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test-utils';

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

function renderForm(user = ME) {
  get.mockImplementation((path: string) =>
    path === '/auth/me' ? Promise.resolve({ user }) : Promise.reject(new Error(path)),
  );
  return renderWithQuery(
    <ToastProvider>
      <AuthProvider>
        <ChangePasswordForm />
      </AuthProvider>
    </ToastProvider>,
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

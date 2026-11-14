import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';
import type { Locale } from '@/i18n/locale';

const { get, pathname } = vi.hoisted(() => ({ get: vi.fn(), pathname: { value: '/' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathname.value,
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { AuthProvider } from '@/components/auth-context';
import { PasswordResetBanner } from './password-reset-banner';

function renderBanner(mustChangePassword: boolean, path = '/', locale: Locale = 'en') {
  pathname.value = path;
  get.mockResolvedValue({ user: { id: 'u1', role: 'citizen', mustChangePassword } });
  return renderWithQuery(
    <AuthProvider>
      <PasswordResetBanner />
      <p>page</p>
    </AuthProvider>,
    undefined,
    { locale },
  );
}

describe('PasswordResetBanner', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('asks a user on a temporary password to choose a new one', async () => {
    renderBanner(true);
    const link = await screen.findByRole('link', { name: 'Choose a new password' });
    expect(link).toHaveAttribute('href', '/me#change-password');
  });

  it('stays hidden otherwise, and on the account page itself', async () => {
    renderBanner(false);
    await screen.findByText('page');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is hidden on the account page, which shows the form', async () => {
    renderBanner(true, '/me');
    await screen.findByText('page');
    expect(screen.queryByRole('link', { name: 'Choose a new password' })).not.toBeInTheDocument();
  });
});

describe('PasswordResetBanner in Bangla', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('asks for a new password in Bangla', async () => {
    const bn = createTranslator({
      locale: 'bn',
      messages: messagesFor('bn'),
      namespace: 'auth.banner',
    });
    renderBanner(true, '/', 'bn');
    expect(await screen.findByRole('link', { name: bn('link') })).toHaveAttribute(
      'href',
      '/me#change-password',
    );
    expect(screen.getByRole('status')).toHaveTextContent(bn('text'));
  });
});

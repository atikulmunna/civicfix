import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';
import type { Locale } from '@/i18n/locale';

const { get, replace } = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { AuthProvider } from './auth-context';
import { RequireAuth } from './require-auth';

const CITIZEN = { id: 'u1', name: 'Rina', email: 'rina@e.com', role: 'citizen' };

function renderGate(locale: Locale = 'en') {
  return renderWithQuery(
    <AuthProvider>
      <RequireAuth require="admin">
        <p>secret</p>
      </RequireAuth>
    </AuthProvider>,
    undefined,
    { locale },
  );
}

beforeEach(() => {
  get.mockReset();
  replace.mockClear();
});

describe('RequireAuth', () => {
  it('waits for the session, then turns away a resident from an admin page', async () => {
    let resolve: (value: { user: typeof CITIZEN }) => void = () => undefined;
    get.mockReturnValue(new Promise((r) => (resolve = r)));
    renderGate();
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();

    resolve({ user: CITIZEN });
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(screen.getByText('You don’t have permission to view this page.')).toBeInTheDocument();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('sends a signed-out visitor to sign in, then back', async () => {
    get.mockRejectedValue(new Error('no session'));
    renderGate();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?next=%2Fadmin'));
  });
});

describe('RequireAuth in Bangla', () => {
  const bn = createTranslator({
    locale: 'bn',
    messages: messagesFor('bn'),
    namespace: 'auth.gate',
  });

  it('waits and turns away in Bangla', async () => {
    let resolve: (value: { user: typeof CITIZEN }) => void = () => undefined;
    get.mockReturnValue(new Promise((r) => (resolve = r)));
    renderGate('bn');
    expect(screen.getByText(bn('checking'))).toBeInTheDocument();

    resolve({ user: CITIZEN });
    expect(await screen.findByRole('heading', { name: bn('deniedTitle') })).toBeInTheDocument();
    expect(screen.getByText(bn('deniedBody'))).toBeInTheDocument();
  });
});

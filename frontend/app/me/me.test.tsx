import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test-utils';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/me',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, patch } };
});

import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import { queryKeys } from '@/lib/query-keys';
import MePage from './page';

const me = {
  id: 'u1',
  name: 'Rina',
  email: 'rina@example.com',
  role: 'citizen',
  departmentId: null,
  trustScore: 0,
  phone: null,
  phoneIsPublic: false,
  mustChangePassword: false,
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('profile form', () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    get.mockImplementation((path: string) =>
      path === '/auth/me' ? Promise.resolve({ user: me }) : Promise.reject(new Error(path)),
    );
  });

  it('saves and puts the updated user in the session cache without refetching it', async () => {
    patch.mockResolvedValue({ user: { ...me, name: 'Rina Akter' } });
    const { client } = renderWithQuery(
      <ToastProvider>
        <AuthProvider>
          <MePage />
        </AuthProvider>
      </ToastProvider>,
    );
    const user = userEvent.setup();

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Rina Akter');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Profile updated.')).toBeInTheDocument();
    expect(patch).toHaveBeenCalledWith(
      '/users/me',
      expect.objectContaining({ name: 'Rina Akter' }),
    );
    expect(client.getQueryData(queryKeys.me)).toMatchObject({ name: 'Rina Akter' });
    // One /auth/me for the initial session, none after saving.
    expect(get.mock.calls.filter(([path]) => path === '/auth/me')).toHaveLength(1);
  });
});

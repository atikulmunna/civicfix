import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test-utils';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/manage',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post } };
});

import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import { UsersAdmin } from './users-admin';

const ADMIN = { id: 'a1', name: 'Ada', email: 'ada@e.com', role: 'admin' };
const rows = [
  ADMIN,
  { id: 'c1', name: 'Cit', email: 'cit@e.com', role: 'citizen' },
  { id: 's1', name: 'Sup', email: 'sup@e.com', role: 'super_admin' },
].map((u) => ({ ...u, isActive: true, departmentId: null }));

function renderAdmin() {
  get.mockImplementation((path: string) =>
    path === '/auth/me'
      ? Promise.resolve({ user: ADMIN })
      : Promise.resolve({ items: rows, page: 1, limit: 20, total: 3, totalPages: 1 }),
  );
  return renderWithQuery(
    <ToastProvider>
      <AuthProvider>
        <UsersAdmin />
      </AuthProvider>
    </ToastProvider>,
  );
}

const rowFor = async (email: string) =>
  (await screen.findByText(email)).closest('tr') as HTMLElement;

describe('UsersAdmin password reset', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('offers reset only for accounts the admin may manage', async () => {
    renderAdmin();
    const citizen = await rowFor('cit@e.com');
    expect(within(citizen).getByRole('button', { name: 'Reset password' })).toBeInTheDocument();
    for (const email of ['ada@e.com', 'sup@e.com']) {
      const row = await rowFor(email);
      expect(within(row).queryByRole('button', { name: 'Reset password' })).toBeNull();
    }
  });

  it('confirms first, then shows the temporary password once', async () => {
    post.mockResolvedValue({ temporaryPassword: 'Tmp-pass_1234567' });
    renderAdmin();
    const u = userEvent.setup();
    await u.click(
      within(await rowFor('cit@e.com')).getByRole('button', { name: 'Reset password' }),
    );

    const dialog = screen.getByRole('alertdialog', { name: 'Confirm password reset' });
    expect(post).not.toHaveBeenCalled();
    await u.click(within(dialog).getByRole('button', { name: 'Reset password' }));

    expect(post).toHaveBeenCalledWith('/admin/users/c1/reset-password');
    expect(await screen.findByTestId('temporary-password')).toHaveTextContent('Tmp-pass_1234567');
    await u.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('temporary-password')).toBeNull();
  });
});

describe('UsersAdmin search', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('waits for typing to pause instead of querying on every keystroke', async () => {
    renderAdmin();
    await screen.findByText('cit@e.com');
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Search users'), 'cit');

    const searches = () =>
      get.mock.calls
        .filter(([path]) => path === '/admin/users')
        .map(([, params]) => (params as { search?: string }).search)
        .filter((s): s is string => s !== undefined);
    await waitFor(() => expect(searches()).toEqual(['cit']));
  });
});

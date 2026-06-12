import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { get, patch, push } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, patch } };
});

import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import NotificationsPage from './page';

const ME = { id: 'u1', name: 'Me', email: 'me@e.com', role: 'citizen' };
const notif = (over = {}) => ({
  id: 'n1', reportId: 'r1', title: 'Report status updated', message: 'now resolved',
  type: 'status_change', isRead: false, createdAt: new Date().toISOString(), ...over,
});

describe('NotificationsPage', () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset().mockResolvedValue({});
    push.mockClear();
    let unread = 1;
    get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: ME });
      if (path === '/notifications')
        return Promise.resolve({ items: [notif({ isRead: unread === 0 })], unreadCount: unread, page: 1, limit: 50, total: 1, totalPages: 1 });
      return Promise.resolve({});
    });
    // After mark-all, subsequent loads report zero unread.
    patch.mockImplementation((path: string) => {
      if (path === '/notifications/read-all') unread = 0;
      return Promise.resolve({});
    });
  });

  it('shows notifications and marks all read', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AuthProvider>
          <NotificationsPage />
        </AuthProvider>
      </ToastProvider>,
    );

    expect(await screen.findByText('now resolved')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/notifications/read-all'));
  });
});

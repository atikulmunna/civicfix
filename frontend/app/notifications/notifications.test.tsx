import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';
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
  id: 'n1',
  reportId: 'r1',
  title: 'Report status updated',
  message: 'now resolved',
  type: 'status_change',
  isRead: false,
  createdAt: new Date().toISOString(),
  kind: null,
  params: null,
  ...over,
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
        return Promise.resolve({
          items: [notif({ isRead: unread === 0 })],
          unreadCount: unread,
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
        });
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
    renderWithQuery(
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

describe('NotificationsPage in Bangla', () => {
  const bn = createTranslator({
    locale: 'bn',
    messages: messagesFor('bn'),
    namespace: 'notifications',
  });

  function renderBangla() {
    renderWithQuery(
      <ToastProvider>
        <AuthProvider>
          <NotificationsPage />
        </AuthProvider>
      </ToastProvider>,
      undefined,
      { locale: 'bn' },
    );
  }

  beforeEach(() => {
    get.mockReset();
    patch.mockReset().mockResolvedValue({});
  });

  function serve(items: ReturnType<typeof notif>[]) {
    get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: ME });
      return Promise.resolve({
        items,
        unreadCount: items.filter((n) => !n.isRead).length,
        page: 1,
        limit: 50,
        total: items.length,
        totalPages: 1,
      });
    });
  }

  it('labels the page in Bangla and counts unread in Bangla digits', async () => {
    serve([notif(), notif({ id: 'n2', title: 'New comment', isRead: true })]);
    renderBangla();
    // The notification text itself comes from the server, as sent.
    expect(
      await screen.findByText('Report status updated', { selector: 'span' }),
    ).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(bn('title'));
    expect(heading).toHaveTextContent('১');
    expect(screen.getByRole('button', { name: bn('markAll') })).toBeInTheDocument();
  });

  it('says so in Bangla when there are none', async () => {
    serve([]);
    renderBangla();
    expect(await screen.findByText(bn('empty'))).toBeInTheDocument();
  });

  it('falls back to a Bangla message when loading fails', async () => {
    get.mockImplementation((path: string) =>
      path === '/auth/me' ? Promise.resolve({ user: ME }) : Promise.reject(new Error('down')),
    );
    renderBangla();
    expect(await screen.findByRole('alert')).toHaveTextContent(bn('loadError'));
  });
});

describe('notification kinds (F5)', () => {
  const rows = [
    notif({
      id: 'k1',
      title: 'Report status updated',
      message: 'Your report "Dark street" is now in progress.',
      kind: 'status_changed',
      params: { reportTitle: 'Dark street', status: 'IN_PROGRESS' },
    }),
    notif({
      id: 'k2',
      title: 'Fix disputed',
      message: 'Residents disputed the fix for "Open drain". It is back in progress.',
      kind: 'fix_disputed',
      params: { reportTitle: 'Open drain' },
    }),
    notif({ id: 'k3', title: 'Old style', message: 'Stored English from before kinds.' }),
  ];

  beforeEach(() => {
    get.mockReset();
    patch.mockReset().mockResolvedValue({});
    get.mockImplementation((path: string) =>
      path === '/auth/me'
        ? Promise.resolve({ user: ME })
        : Promise.resolve({
            items: rows,
            unreadCount: 3,
            page: 1,
            limit: 50,
            total: 3,
            totalPages: 1,
          }),
    );
  });

  function renderIn(locale: 'en' | 'bn') {
    renderWithQuery(
      <ToastProvider>
        <AuthProvider>
          <NotificationsPage />
        </AuthProvider>
      </ToastProvider>,
      undefined,
      { locale },
    );
  }

  it('words them in Bangla, with the Bangla status, and keeps old rows as stored', async () => {
    const bn = createTranslator({
      locale: 'bn',
      messages: messagesFor('bn'),
      namespace: 'notifications.kinds',
    });
    renderIn('bn');
    const status = messagesFor('bn').status.IN_PROGRESS;
    expect(
      await screen.findByText(bn('status_changed.message', { reportTitle: 'Dark street', status })),
    ).toBeInTheDocument();
    expect(screen.getByText(bn('status_changed.title'))).toBeInTheDocument();
    expect(screen.getByText(bn('fix_disputed.title'))).toBeInTheDocument();
    expect(
      screen.getByText(bn('fix_disputed.message', { reportTitle: 'Open drain' })),
    ).toBeInTheDocument();
    expect(screen.getByText('Stored English from before kinds.')).toBeInTheDocument();
    expect(screen.queryByText(/is now in progress/)).toBeNull();
  });

  it('shows what the server wrote, in English', async () => {
    renderIn('en');
    expect(
      await screen.findByText('Your report "Dark street" is now in progress.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Fix disputed')).toBeInTheDocument();
  });
});

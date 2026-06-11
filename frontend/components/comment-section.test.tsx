import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post, del } };
});

import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import { CommentSection } from './comment-section';

const ME = { id: 'u1', name: 'Me', email: 'me@e.com', role: 'citizen' };

function setup() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <CommentSection reportId="r1" />
      </AuthProvider>
    </ToastProvider>,
  );
}

describe('CommentSection', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    del.mockReset();
    get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: ME });
      if (path.endsWith('/comments'))
        return Promise.resolve({
          comments: [
            { id: 'c1', reportId: 'r1', content: 'Existing comment', author: { id: 'u2', name: 'Bob' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          ],
        });
      return Promise.resolve({});
    });
  });

  it('renders existing comments', async () => {
    setup();
    expect(await screen.findByText('Existing comment')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('posts a new comment and appends it', async () => {
    post.mockResolvedValue({
      comment: { id: 'c2', reportId: 'r1', content: 'My new comment', author: ME, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });
    const user = userEvent.setup();
    setup();
    await screen.findByText('Existing comment');

    await user.type(screen.getByLabelText('Add a comment'), 'My new comment');
    await user.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/reports/r1/comments', { content: 'My new comment' }));
    expect(await screen.findByText('My new comment')).toBeInTheDocument();
  });
});

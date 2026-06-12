import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post, del } };
});

import { ToastProvider } from '@/components/toast';
import { CatalogAdmin } from './catalog-admin';

const config = {
  listPath: '/categories', adminPath: '/admin/categories', responseKey: 'categories', itemKey: 'category',
  secondary: { key: 'icon', label: 'Icon (optional)' },
};

describe('CatalogAdmin', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ categories: [{ id: 'c1', name: 'Roads', isActive: true }] });
    post.mockReset().mockResolvedValue({});
    del.mockReset().mockResolvedValue({});
  });

  it('creates an item', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><CatalogAdmin config={config} /></ToastProvider>);
    await screen.findByText('Roads');

    await user.type(screen.getByLabelText('New category name'), 'Parks');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/categories', { name: 'Parks' }));
  });

  it('disables an active item', async () => {
    const user = userEvent.setup();
    render(<ToastProvider><CatalogAdmin config={config} /></ToastProvider>);
    await screen.findByText('Roads');

    await user.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/admin/categories/c1'));
  });
});

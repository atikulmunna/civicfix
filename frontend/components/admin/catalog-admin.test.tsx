import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '@/test-utils';
import userEvent from '@testing-library/user-event';

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post, patch, del } };
});

import { ToastProvider } from '@/components/toast';
import { CatalogAdmin, type CatalogConfig } from './catalog-admin';

const config: CatalogConfig = {
  listPath: '/categories',
  adminPath: '/admin/categories',
  responseKey: 'categories',
  itemKey: 'category',
  secondary: { key: 'icon', label: 'Icon (optional)' },
};

describe('CatalogAdmin', () => {
  beforeEach(() => {
    get
      .mockReset()
      .mockResolvedValue({ categories: [{ id: 'c1', name: 'Roads', isActive: true }] });
    post.mockReset().mockResolvedValue({});
    del.mockReset().mockResolvedValue({});
  });

  it('creates an item', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ToastProvider>
        <CatalogAdmin config={config} />
      </ToastProvider>,
    );
    await screen.findByText('Roads');

    await user.type(screen.getByLabelText('New category name'), 'Parks');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/categories', { name: 'Parks' }));
  });

  it('disables an active item', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ToastProvider>
        <CatalogAdmin config={config} />
      </ToastProvider>,
    );
    await screen.findByText('Roads');

    await user.click(screen.getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/admin/categories/c1'));
  });
});

describe('CatalogAdmin Bangla names (F5)', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue({
      categories: [{ id: 'c1', name: 'Roads', nameBn: null, isActive: true }],
    });
    post.mockReset().mockResolvedValue({});
    patch.mockReset().mockResolvedValue({});
  });

  function renderAdmin() {
    renderWithQuery(
      <ToastProvider>
        <CatalogAdmin config={config} />
      </ToastProvider>,
    );
  }

  it('creates an item with its Bangla name', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await screen.findByText('Roads');
    await user.type(screen.getByLabelText('New category name'), 'Parks');
    await user.type(screen.getByLabelText('New category name in Bangla'), 'পার্ক');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/admin/categories', { name: 'Parks', nameBn: 'পার্ক' }),
    );
  });

  it('sets the Bangla name of an existing item', async () => {
    const user = userEvent.setup();
    renderAdmin();
    const input = await screen.findByLabelText('Name in Bangla for Roads');
    await user.type(input, 'রাস্তা');
    await user.click(screen.getByRole('button', { name: 'Save Bangla name for Roads' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/admin/categories/c1', { nameBn: 'রাস্তা' }),
    );
  });
});

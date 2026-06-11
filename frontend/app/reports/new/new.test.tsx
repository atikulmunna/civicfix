import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { get, post, postForm, push } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), postForm: vi.fn(), push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/reports/new',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get, post, postForm } };
});

// Replace the Leaflet picker with a simple button that sets a location.
vi.mock('@/components/location-picker', () => ({
  LocationPicker: ({ onChange }: { onChange: (p: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 23.8, lng: 90.4 })}>set-location</button>
  ),
}));

import { AuthProvider } from '@/components/auth-context';
import { ToastProvider } from '@/components/toast';
import NewReportPage from './page';

const ME = { id: 'u1', name: 'Me', email: 'me@e.com', role: 'citizen' };

describe('NewReportPage', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    postForm.mockReset();
    push.mockClear();
    get.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ user: ME });
      if (path === '/categories') return Promise.resolve({ categories: [{ id: 'c1', name: 'Roads' }] });
      return Promise.resolve({});
    });
    post.mockResolvedValue({ possibleDuplicates: [] });
    postForm.mockResolvedValue({ report: { id: 'new1' } });
  });

  it('submits a multipart report and redirects to the new report', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AuthProvider>
          <NewReportPage />
        </AuthProvider>
      </ToastProvider>,
    );

    await screen.findByLabelText('Title');
    await user.type(screen.getByLabelText('Title'), 'Broken light');
    await user.type(screen.getByLabelText('Description'), 'The light is out completely.');
    await user.selectOptions(screen.getByLabelText('Category'), 'c1');
    await user.click(await screen.findByText('set-location'));

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Photos'), file);

    await user.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => expect(postForm).toHaveBeenCalledWith('/reports', expect.any(FormData)));
    const fd = postForm.mock.calls[0][1] as FormData;
    expect(fd.get('title')).toBe('Broken light');
    expect(fd.get('categoryId')).toBe('c1');
    expect(fd.get('latitude')).toBe('23.8');
    expect(fd.getAll('images')).toHaveLength(1);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/reports/new1'));
  });
});

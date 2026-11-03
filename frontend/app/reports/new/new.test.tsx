import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '@/test-utils';
import userEvent from '@testing-library/user-event';

const { get, post, postForm, push } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  postForm: vi.fn(),
  push: vi.fn(),
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
    <button type="button" onClick={() => onChange({ lat: 23.8, lng: 90.4 })}>
      set-location
    </button>
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
      if (path === '/categories')
        return Promise.resolve({ categories: [{ id: 'c1', name: 'Roads' }] });
      return Promise.resolve({});
    });
    post.mockResolvedValue({ possibleDuplicates: [] });
    postForm.mockResolvedValue({ report: { id: 'new1' } });
  });

  it('submits a multipart report and redirects to the new report', async () => {
    const user = userEvent.setup();
    renderWithQuery(
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
    const fd = postForm.mock.calls[0]?.[1] as FormData;
    expect(fd.get('title')).toBe('Broken light');
    expect(fd.get('categoryId')).toBe('c1');
    expect(fd.get('latitude')).toBe('23.8');
    expect(fd.getAll('images')).toHaveLength(1);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/reports/new1'));
  });

  /** Fills every required field except photos. */
  async function fillForm(user: ReturnType<typeof userEvent.setup>) {
    renderWithQuery(
      <ToastProvider>
        <AuthProvider>
          <NewReportPage />
        </AuthProvider>
      </ToastProvider>,
    );
    await user.type(await screen.findByLabelText('Title'), 'Broken light');
    await user.type(screen.getByLabelText('Description'), 'The light is out completely.');
    await user.selectOptions(screen.getByLabelText('Category'), 'c1');
    await user.click(await screen.findByText('set-location'));
  }

  const png = (bytes: number, name: string) =>
    new File([new Uint8Array(bytes)], name, { type: 'image/png' });

  it('refuses more photos than a report can hold', async () => {
    const user = userEvent.setup();
    await fillForm(user);

    const six = Array.from({ length: 6 }, (_, i) => png(10, `p${String(i)}.png`));
    await user.upload(screen.getByLabelText('Photos'), six);
    expect(screen.getByText('Choose up to 5 photos.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /submit report/i }));
    expect(await screen.findByText('Please add at least one photo.')).toBeInTheDocument();
    expect(postForm).not.toHaveBeenCalled();
  });

  it('stops before uploading photos too large for the web proxy', async () => {
    const user = userEvent.setup();
    await fillForm(user);

    // jsdom cannot decode images, so the files reach the size check unchanged.
    await user.upload(screen.getByLabelText('Photos'), [
      png(2 * 1024 * 1024, 'a.png'),
      png(2 * 1024 * 1024, 'b.png'),
    ]);
    await user.click(screen.getByRole('button', { name: /submit report/i }));

    expect(
      await screen.findByText(/These photos add up to 4 MB, over the 3.5 MB limit/),
    ).toBeInTheDocument();
    expect(postForm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /submit report/i })).toBeEnabled();
  });
});

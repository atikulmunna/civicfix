import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithQuery } from '@/test-utils';
import type { Locale } from '@/i18n/locale';
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
import { queryKeys } from '@/lib/query-keys';
import NewReportPage from './page';

const ME = { id: 'u1', name: 'Me', email: 'me@e.com', role: 'citizen' };

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

function renderPage(locale: Locale = 'en') {
  return renderWithQuery(
    <ToastProvider>
      <AuthProvider>
        <NewReportPage />
      </AuthProvider>
    </ToastProvider>,
    undefined,
    { locale },
  );
}

const png = (bytes: number, name: string) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' });

describe('NewReportPage', () => {
  it('submits a multipart report and redirects to the new report', async () => {
    const user = userEvent.setup();
    const { client } = renderPage();

    // A list cached before the submit must not keep showing the old reports.
    client.setQueryData(queryKeys.reports({ page: 1 }), { items: [] });
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
    expect(client.getQueryState(queryKeys.reports({ page: 1 }))?.isInvalidated).toBe(true);
  });

  /** Fills every required field except photos. */
  async function fillForm(user: ReturnType<typeof userEvent.setup>) {
    renderPage();
    await user.type(await screen.findByLabelText('Title'), 'Broken light');
    await user.type(screen.getByLabelText('Description'), 'The light is out completely.');
    await user.selectOptions(screen.getByLabelText('Category'), 'c1');
    await user.click(await screen.findByText('set-location'));
  }

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

describe('NewReportPage in Bangla', () => {
  const bn = createTranslator({
    locale: 'bn',
    messages: messagesFor('bn'),
    namespace: 'newReport',
  });
  const severity = createTranslator({
    locale: 'bn',
    messages: messagesFor('bn'),
    namespace: 'severity',
  });

  it('labels every field and choice in Bangla, with the photo limit in Bangla digits', async () => {
    renderPage('bn');
    expect(await screen.findByLabelText(bn('fields.title'))).toBeInTheDocument();
    for (const label of [
      bn('fields.description'),
      bn('fields.category'),
      bn('fields.severity'),
      bn('fields.address'),
      bn('fields.landmark'),
      bn('fields.photos'),
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(bn('fields.location'))).toBeInTheDocument();
    expect(screen.getByRole('option', { name: bn('fields.choose') })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: severity('urgent') })).toBeInTheDocument();
    expect(screen.getByText(bn('photosHint', { max: 5 }))).toHaveTextContent('৫');
    expect(screen.getByRole('heading', { name: bn('title') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: bn('submit') })).toBeInTheDocument();
  });

  it('warns about possible duplicates in Bangla', async () => {
    post.mockResolvedValue({ possibleDuplicates: [{ id: 'd1', title: 'Dark street' }] });
    const user = userEvent.setup();
    renderPage('bn');
    await screen.findByRole('option', { name: 'Roads' });
    await user.selectOptions(screen.getByLabelText(bn('fields.category')), 'c1');
    await user.click(screen.getByText('set-location'));

    expect(await screen.findByText(bn('duplicates', { count: 1 }))).toBeInTheDocument();
    expect(screen.getByText(bn('duplicatesNote'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dark street' })).toHaveAttribute(
      'href',
      '/reports/d1',
    );
  });

  it('explains location and photo problems in Bangla, with Bangla digits', async () => {
    const user = userEvent.setup();
    renderPage('bn');
    await screen.findByRole('option', { name: 'Roads' });
    const submit = screen.getByRole('button', { name: bn('submit') });

    await user.click(submit);
    expect(await screen.findByText(bn('errors.noLocation'))).toBeInTheDocument();

    await user.click(screen.getByText('set-location'));
    const photos = screen.getByLabelText(bn('fields.photos'));
    await user.upload(
      photos,
      Array.from({ length: 6 }, (_, i) => png(10, `p${String(i)}.png`)),
    );
    expect(screen.getByText(bn('errors.tooManyPhotos', { max: 5 }))).toHaveTextContent('৫');

    await user.click(submit);
    expect(await screen.findByText(bn('errors.noPhoto'))).toBeInTheDocument();

    await user.upload(photos, [png(2 * 1024 * 1024, 'a.png'), png(2 * 1024 * 1024, 'b.png')]);
    await user.click(submit);
    expect(
      await screen.findByText(bn('errors.tooLarge', { size: 4, limit: 3.5 })),
    ).toHaveTextContent('৩.৫');
    expect(postForm).not.toHaveBeenCalled();
  });

  /** Fills the whole form, a photo included, through its Bangla labels. */
  async function fillInBangla(user: ReturnType<typeof userEvent.setup>) {
    renderPage('bn');
    await user.type(await screen.findByLabelText(bn('fields.title')), 'Broken light');
    await user.type(screen.getByLabelText(bn('fields.description')), 'The light is out.');
    await screen.findByRole('option', { name: 'Roads' });
    await user.selectOptions(screen.getByLabelText(bn('fields.category')), 'c1');
    await user.click(screen.getByText('set-location'));
    await user.upload(screen.getByLabelText(bn('fields.photos')), png(10, 'p.png'));
    await user.click(screen.getByRole('button', { name: bn('submit') }));
  }

  it('thanks the resident in Bangla once the report is in', async () => {
    const user = userEvent.setup();
    await fillInBangla(user);
    expect(await screen.findByText(bn('submitted'))).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/reports/new1'));
  });

  it('says in Bangla when the report could not be sent', async () => {
    postForm.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    await fillInBangla(user);
    expect(await screen.findByText(bn('errors.submitFailed'))).toBeInTheDocument();
  });
});

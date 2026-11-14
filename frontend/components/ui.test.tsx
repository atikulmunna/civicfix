import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithIntl } from '@/test-utils';
import type { Locale } from '@/i18n/locale';
import { Label, PhotoPicker } from './ui';

function Picker({ multiple = false }: { multiple?: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <>
      <Label htmlFor="photo">Photo</Label>
      <PhotoPicker
        id="photo"
        multiple={multiple}
        files={files}
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
    </>
  );
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' });
const renderPicker = (multiple: boolean, locale: Locale = 'en') =>
  renderWithIntl(<Picker multiple={multiple} />, { locale });

describe('PhotoPicker', () => {
  it('names its button and what is chosen in the page language, not the browser one', async () => {
    renderPicker(true);
    expect(screen.getByText('Choose photos')).toBeInTheDocument();
    expect(screen.getByText('No photo chosen')).toBeInTheDocument();

    await userEvent.setup().upload(screen.getByLabelText('Photo'), [png('a.png'), png('b.png')]);
    expect(screen.getByText('2 photos chosen')).toBeInTheDocument();
  });

  it('shows the file name when one photo is chosen', async () => {
    renderPicker(false);
    expect(screen.getByText('Choose a photo')).toBeInTheDocument();
    await userEvent.setup().upload(screen.getByLabelText('Photo'), png('drain.png'));
    expect(screen.getByText('drain.png')).toBeInTheDocument();
  });

  it('keeps the real input reachable by keyboard and describes the choice', async () => {
    renderPicker(true);
    const input = screen.getByLabelText('Photo');
    expect(input).toHaveAttribute('type', 'file');
    await userEvent.setup().tab();
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription('No photo chosen');
  });

  it('speaks Bangla, with Bangla digits', async () => {
    const bn = createTranslator({
      locale: 'bn',
      messages: messagesFor('bn'),
      namespace: 'common.photoPicker',
    });
    renderPicker(true, 'bn');
    expect(screen.getByText(bn('chooseMany'))).toBeInTheDocument();
    expect(screen.getByText(bn('none'))).toBeInTheDocument();
    await userEvent.setup().upload(screen.getByLabelText('Photo'), [png('a.png'), png('b.png')]);
    expect(screen.getByText(bn('chosen', { count: 2 }))).toHaveTextContent('২');
  });
});

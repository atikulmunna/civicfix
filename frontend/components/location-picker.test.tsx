import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithIntl } from '@/test-utils';

// jsdom cannot run Leaflet: render the controls around an empty map.
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  CircleMarker: () => null,
  useMapEvents: () => null,
}));

import { LocationPicker } from './location-picker';

describe('LocationPicker', () => {
  it('asks for a pin until one is set', () => {
    renderWithIntl(<LocationPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Click the map to set the location.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeInTheDocument();
  });

  it('shows the chosen point to five decimals', () => {
    renderWithIntl(<LocationPicker value={{ lat: 23.8, lng: 90.4 }} onChange={vi.fn()} />);
    expect(screen.getByText('Selected: 23.80000, 90.40000')).toBeInTheDocument();
  });

  it('speaks Bangla, with the point in Bangla digits', () => {
    const bn = createTranslator({
      locale: 'bn',
      messages: messagesFor('bn'),
      namespace: 'newReport.picker',
    });
    const { unmount } = renderWithIntl(<LocationPicker value={null} onChange={vi.fn()} />, {
      locale: 'bn',
    });
    expect(screen.getByText(bn('prompt'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: bn('useMine') })).toBeInTheDocument();
    unmount();

    renderWithIntl(<LocationPicker value={{ lat: 23.8, lng: 90.4 }} onChange={vi.fn()} />, {
      locale: 'bn',
    });
    expect(
      screen.getByText(bn('selected', { lat: '২৩.৮০০০০', lng: '৯০.৪০০০০' })),
    ).toBeInTheDocument();
  });
});

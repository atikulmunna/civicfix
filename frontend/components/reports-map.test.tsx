import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

// jsdom cannot run Leaflet: render children, and report fixed bounds.
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  CircleMarker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMapEvents: () => ({
    getBounds: () => ({
      getWest: () => 90.3,
      getSouth: () => 23.7,
      getEast: () => 90.5,
      getNorth: () => 23.9,
    }),
  }),
}));

import { ApiError } from '@/lib/api';
import { ReportsMap } from './reports-map';

const marker = {
  id: 'r1',
  title: 'Flooded underpass',
  status: 'SUBMITTED',
  severity: 'high',
  categoryId: 'c1',
  latitude: 23.8,
  longitude: 90.4,
};

function respond(map: () => Promise<unknown>) {
  get.mockImplementation((path: string) => {
    if (path === '/categories') return Promise.resolve({ categories: [] });
    if (path === '/reports/map') return map();
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const mapCalls = () =>
  get.mock.calls
    .filter(([path]) => path === '/reports/map')
    .map(([, params]) => params as { bbox: string; status?: string });

describe('ReportsMap', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('loads the markers inside the visible bounds', async () => {
    respond(() => Promise.resolve({ items: [marker] }));
    renderWithQuery(<ReportsMap />);

    expect(await screen.findByText('Flooded underpass')).toBeInTheDocument();
    expect(screen.getByText('1 in view')).toBeInTheDocument();
    expect(mapCalls()[0]).toMatchObject({ bbox: '90.3,23.7,90.5,23.9', limit: 1000 });
  });

  it('shows the API error instead of an empty map', async () => {
    respond(() => Promise.reject(new ApiError('Service unavailable.', 'INTERNAL_ERROR', 503)));
    renderWithQuery(<ReportsMap />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.');
    expect(screen.queryByText('0 in view')).toBeNull();
  });

  it('reloads with the chosen status filter', async () => {
    respond(() => Promise.resolve({ items: [] }));
    renderWithQuery(<ReportsMap />);
    expect(await screen.findByText('0 in view')).toBeInTheDocument();

    await userEvent.setup().selectOptions(screen.getByLabelText('Status'), 'RESOLVED');
    await waitFor(() => expect(mapCalls().at(-1)).toMatchObject({ status: 'RESOLVED' }));
  });
});

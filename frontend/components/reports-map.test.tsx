import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQuery } from '@/test-utils';

const { get, flyTo } = vi.hoisted(() => ({ get: vi.fn(), flyTo: vi.fn() }));
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
  Circle: ({ children }: { children: ReactNode }) => <div data-testid="hotspot">{children}</div>,
  useMap: () => ({ flyTo }),
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
import { ReportsMap, type MapFocus } from './reports-map';

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
    if (path === '/hotspots') return Promise.resolve(hotspots);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const mapCalls = () =>
  get.mock.calls
    .filter(([path]) => path === '/reports/map')
    .map(([, params]) => params as { bbox: string; status?: string });

const hotspots = {
  generatedAt: '2026-11-09T00:00:00.000Z',
  windowDays: 90,
  radiusM: 150,
  minReports: 3,
  hotspots: [
    {
      latitude: 23.8,
      longitude: 90.4,
      radiusM: 87,
      reportCount: 3,
      openCount: 3,
      categories: [{ categoryId: 'c1', name: 'Drainage', count: 3 }],
      recurring: true,
      latestReportAt: '2026-11-08T00:00:00.000Z',
      reports: [],
    },
  ],
};

function renderMap(
  props: {
    showHotspots?: boolean;
    focus?: MapFocus | null;
    onShowHotspotsChange?: () => void;
  } = {},
) {
  return renderWithQuery(
    <ReportsMap
      showHotspots={props.showHotspots ?? false}
      onShowHotspotsChange={props.onShowHotspotsChange ?? vi.fn()}
      focus={props.focus ?? null}
    />,
  );
}

describe('ReportsMap', () => {
  beforeEach(() => {
    get.mockReset();
    flyTo.mockReset();
  });

  it('loads the markers inside the visible bounds', async () => {
    respond(() => Promise.resolve({ items: [marker] }));
    renderMap();

    expect(await screen.findByText('Flooded underpass')).toBeInTheDocument();
    expect(screen.getByText('1 in view')).toBeInTheDocument();
    expect(mapCalls()[0]).toMatchObject({ bbox: '90.3,23.7,90.5,23.9', limit: 1000 });
  });

  it('shows the API error instead of an empty map', async () => {
    respond(() => Promise.reject(new ApiError('Service unavailable.', 'INTERNAL_ERROR', 503)));
    renderMap();

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.');
    expect(screen.queryByText('0 in view')).toBeNull();
  });

  it('reloads with the chosen status filter', async () => {
    respond(() => Promise.resolve({ items: [] }));
    renderMap();
    expect(await screen.findByText('0 in view')).toBeInTheDocument();

    await userEvent.setup().selectOptions(screen.getByLabelText('Status'), 'RESOLVED');
    await waitFor(() => expect(mapCalls().at(-1)).toMatchObject({ status: 'RESOLVED' }));
  });

  it('shades hotspots when they are shown, and says what is there', async () => {
    respond(() => Promise.resolve({ items: [] }));
    renderMap({ showHotspots: true });
    expect(await screen.findByTestId('hotspot')).toBeInTheDocument();
    expect(screen.getByText('Drainage')).toBeInTheDocument();
    expect(screen.getByText('3 reports within 90 m, none fixed yet.')).toBeInTheDocument();
    expect(screen.getByText('A fixed problem came back here.')).toBeInTheDocument();
  });

  it('neither asks for nor draws hotspots when they are hidden', async () => {
    respond(() => Promise.resolve({ items: [] }));
    renderMap({ showHotspots: false });
    expect(await screen.findByText('0 in view')).toBeInTheDocument();
    expect(screen.queryByTestId('hotspot')).toBeNull();
    expect(get.mock.calls.some(([path]) => path === '/hotspots')).toBe(false);
  });

  it('reports the hotspot toggle', async () => {
    respond(() => Promise.resolve({ items: [] }));
    const onShowHotspotsChange = vi.fn();
    renderMap({ showHotspots: true, onShowHotspotsChange });
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Hotspots' }));
    expect(onShowHotspotsChange).toHaveBeenCalledWith(false);
  });

  it('flies to a place picked from the hotspot list', async () => {
    respond(() => Promise.resolve({ items: [] }));
    renderMap({ focus: { latitude: 23.81, longitude: 90.41, seq: 1 } });
    await waitFor(() => expect(flyTo).toHaveBeenCalledWith([23.81, 90.41], 16));
  });
});

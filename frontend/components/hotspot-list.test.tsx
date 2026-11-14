import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import userEvent from '@testing-library/user-event';
import { messagesFor, renderWithQuery } from '@/test-utils';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get } };
});

import { ApiError } from '@/lib/api';
import type { Hotspot } from '@/lib/types';
import { HotspotList } from './hotspot-list';

const spot = (over: Partial<Hotspot>): Hotspot => ({
  latitude: 23.8,
  longitude: 90.4,
  radiusM: 120,
  reportCount: 5,
  openCount: 2,
  categories: [
    { categoryId: 'c1', name: 'Drainage', count: 4 },
    { categoryId: 'c2', name: 'Roads', count: 1 },
  ],
  recurring: false,
  latestReportAt: '2026-11-05T10:00:00.000Z',
  reports: [
    {
      id: 'r1',
      title: 'Blocked drain',
      status: 'SUBMITTED',
      createdAt: '2026-11-05T10:00:00.000Z',
    },
    { id: 'r2', title: 'Flooded lane', status: 'RESOLVED', createdAt: '2026-11-01T10:00:00.000Z' },
    { id: 'r3', title: 'Open drain', status: 'ASSIGNED', createdAt: '2026-10-30T10:00:00.000Z' },
    { id: 'r4', title: 'Drain smell', status: 'SUBMITTED', createdAt: '2026-10-29T10:00:00.000Z' },
  ],
  ...over,
});

function respond(hotspots: Hotspot[]) {
  get.mockResolvedValue({
    generatedAt: '2026-11-09T00:00:00.000Z',
    windowDays: 90,
    radiusM: 150,
    minReports: 3,
    hotspots,
  });
}

describe('HotspotList', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('ranks hotspots and says what each one holds', async () => {
    respond([
      spot({}),
      spot({ latitude: 23.9, reportCount: 3, openCount: 3, recurring: true, radiusM: 40 }),
    ]);
    renderWithQuery(<HotspotList onShow={vi.fn()} />);

    // The ranked list's own items (each holds a nested list of report links).
    const items = await screen.findAllByRole('listitem');
    const ranked = items.filter((li) => li.parentElement?.tagName === 'OL');
    expect(ranked).toHaveLength(2);
    const [first, second] = ranked as [HTMLElement, HTMLElement];
    expect(within(first).getByText('Drainage and 1 other kind')).toBeInTheDocument();
    expect(within(first).getByText(/5 reports within 120 m, 2 still open\./)).toBeInTheDocument();
    // Three reports named, newest first; the rest are on the map.
    expect(
      within(first)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Blocked drain', 'Flooded lane', 'Open drain']);
    expect(within(second).getByText('Keeps coming back')).toBeInTheDocument();
    expect(within(second).getByText(/3 reports within 40 m, none fixed yet\./)).toBeInTheDocument();
    expect(
      screen.getByText(/at least 3 reports within 150 m of each other in the last 90 days/),
    ).toBeInTheDocument();
  });

  it('hands the chosen hotspot to the map', async () => {
    const chosen = spot({});
    respond([chosen]);
    const onShow = vi.fn();
    renderWithQuery(<HotspotList onShow={onShow} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show on map' }));
    expect(onShow).toHaveBeenCalledWith(chosen);
  });

  it('says plainly when there are no hotspots', async () => {
    respond([]);
    renderWithQuery(<HotspotList onShow={vi.fn()} />);
    expect(
      await screen.findByText(
        'No hotspots right now: no place has 3 or more reports this close together.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the API error instead of an empty list', async () => {
    get.mockRejectedValue(new ApiError('Service unavailable.', 'INTERNAL_ERROR', 503));
    renderWithQuery(<HotspotList onShow={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.');
  });

  it('reads in Bangla', async () => {
    const t = messagesFor('bn').hotspots;
    respond([spot({ recurring: true })]);
    renderWithQuery(<HotspotList onShow={vi.fn()} />, undefined, { locale: 'bn' });
    expect(screen.getByRole('heading', { name: t.heading })).toBeInTheDocument();
    // The heading shows while loading; wait for the list itself.
    expect(await screen.findByText(t.recurring)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.showOnMap })).toBeInTheDocument();
    expect(screen.getByText(/১৫০/)).toBeInTheDocument();
  });

  it('says in Bangla when there are none', async () => {
    respond([]);
    renderWithQuery(<HotspotList onShow={vi.fn()} />, undefined, { locale: 'bn' });
    const bn = createTranslator({
      locale: 'bn',
      messages: messagesFor('bn'),
      namespace: 'hotspots',
    });
    expect(await screen.findByText(bn('none', { min: 3 }))).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

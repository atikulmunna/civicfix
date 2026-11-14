import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test-utils';
import type { Locale } from '@/i18n/locale';
import { useHotspotText } from './hotspots';
import type { Hotspot } from './types';

const spot = (over: Partial<Hotspot>): Hotspot => ({
  latitude: 23.8,
  longitude: 90.4,
  radiusM: 87,
  reportCount: 4,
  openCount: 2,
  categories: [{ categoryId: 'c1', name: 'Drainage', count: 4 }],
  recurring: false,
  latestReportAt: '2026-11-05T10:00:00.000Z',
  reports: [],
  ...over,
});

function Probe({ hotspot }: { hotspot: Hotspot }) {
  const text = useHotspotText();
  return (
    <>
      <p aria-label="kinds">{text.kinds(hotspot)}</p>
      <p aria-label="counts">{text.counts(hotspot)}</p>
    </>
  );
}

function show(hotspot: Hotspot, locale: Locale = 'en') {
  const { unmount } = renderWithIntl(<Probe hotspot={hotspot} />, { locale });
  const kinds = screen.getByLabelText('kinds').textContent;
  const counts = screen.getByLabelText('counts').textContent;
  unmount();
  return { kinds, counts };
}

const two = [
  { categoryId: 'c1', name: 'Drainage', count: 3 },
  { categoryId: 'c2', name: 'Roads', count: 1 },
];

describe('useHotspotText', () => {
  it('names one kind, or the top kind and how many others', () => {
    expect(show(spot({})).kinds).toBe('Drainage');
    expect(show(spot({ categories: two })).kinds).toBe('Drainage and 1 other kind');
    const three = [...two, { categoryId: 'c3', name: 'Lights', count: 1 }];
    expect(show(spot({ categories: three })).kinds).toBe('Drainage and 2 other kinds');
  });

  it('rounds the reach up to 10 m and says how much is still open', () => {
    expect(show(spot({})).counts).toBe('4 reports within 90 m, 2 still open.');
    expect(show(spot({ openCount: 0 })).counts).toBe('4 reports within 90 m, all fixed.');
    expect(show(spot({ openCount: 4 })).counts).toBe('4 reports within 90 m, none fixed yet.');
    expect(show(spot({ radiusM: 0 })).counts).toBe('4 reports within 10 m, 2 still open.');
  });

  it('says it in Bangla, with Bangla digits', () => {
    const { kinds, counts } = show(spot({ categories: two }), 'bn');
    expect(kinds).toContain('Drainage');
    expect(kinds).toContain('১');
    expect(counts).toContain('৯০');
    expect(counts).toContain('৪');
    expect(counts).not.toMatch(/[A-Za-z0-9]/);
  });
});

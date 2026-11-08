import { describe, expect, it } from 'vitest';
import { hotspotCounts, hotspotKinds } from './hotspots';
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

describe('hotspotKinds', () => {
  it('names one kind, or the top kind and how many others', () => {
    expect(hotspotKinds(spot({}))).toBe('Drainage');
    const two = [
      { categoryId: 'c1', name: 'Drainage', count: 3 },
      { categoryId: 'c2', name: 'Roads', count: 1 },
    ];
    expect(hotspotKinds(spot({ categories: two }))).toBe('Drainage and 1 other kind');
    const three = [...two, { categoryId: 'c3', name: 'Lights', count: 1 }];
    expect(hotspotKinds(spot({ categories: three }))).toBe('Drainage and 2 other kinds');
  });
});

describe('hotspotCounts', () => {
  it('rounds the reach up to 10 m and says how much is still open', () => {
    expect(hotspotCounts(spot({}))).toBe('4 reports within 90 m, 2 still open.');
    expect(hotspotCounts(spot({ openCount: 0 }))).toBe('4 reports within 90 m, all fixed.');
    expect(hotspotCounts(spot({ openCount: 4 }))).toBe('4 reports within 90 m, none fixed yet.');
  });

  it('never says "within 0 m" for reports at one spot', () => {
    expect(hotspotCounts(spot({ radiusM: 0 }))).toBe('4 reports within 10 m, 2 still open.');
  });
});

import { describe, expect, it } from 'vitest';
import {
  distanceM,
  HOTSPOT_LIMIT,
  HOTSPOT_REPORTS_LISTED,
  isRecurring,
  summarize,
  type ClusteredReport,
} from './hotspot.js';

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

let seq = 0;
function report(over: Partial<ClusteredReport>): ClusteredReport {
  seq += 1;
  return {
    clusterId: 0,
    id: `r${String(seq)}`,
    title: `Report ${String(seq)}`,
    status: 'SUBMITTED',
    categoryId: 'roads',
    categoryName: 'Roads',
    latitude: 23.8,
    longitude: 90.4,
    createdAt: day(1),
    resolvedAt: null,
    ...over,
  };
}

describe('distanceM', () => {
  it('measures about 111 m per thousandth of a degree of latitude', () => {
    const d = distanceM({ latitude: 23.8, longitude: 90.4 }, { latitude: 23.801, longitude: 90.4 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('isRecurring', () => {
  it('is true when the same kind of problem was reported after an earlier one was fixed', () => {
    const fixed = report({ status: 'RESOLVED', createdAt: day(1), resolvedAt: day(3) });
    expect(isRecurring([fixed, report({ createdAt: day(5) })])).toBe(true);
  });

  it('ignores reports made before the fix', () => {
    const fixed = report({ status: 'RESOLVED', createdAt: day(1), resolvedAt: day(3) });
    expect(isRecurring([fixed, report({ createdAt: day(2) })])).toBe(false);
  });

  it('ignores a different kind of problem', () => {
    const fixed = report({ status: 'RESOLVED', createdAt: day(1), resolvedAt: day(3) });
    const other = report({ categoryId: 'water', categoryName: 'Water', createdAt: day(5) });
    expect(isRecurring([fixed, other])).toBe(false);
  });

  it('needs a fix to have happened', () => {
    expect(isRecurring([report({ createdAt: day(1) }), report({ createdAt: day(5) })])).toBe(false);
  });
});

describe('summarize', () => {
  it('describes each cluster: centre, reach, counts, kinds and newest reports', () => {
    const [spot] = summarize([
      report({ latitude: 23.8, createdAt: day(1) }),
      report({ latitude: 23.801, createdAt: day(4), status: 'RESOLVED', resolvedAt: day(5) }),
      report({ latitude: 23.802, createdAt: day(2), categoryId: 'water', categoryName: 'Water' }),
    ]);
    expect(spot).toBeDefined();
    expect(spot?.latitude).toBeCloseTo(23.801, 6);
    expect(spot?.radiusM).toBeGreaterThan(110);
    expect(spot?.radiusM).toBeLessThan(113);
    expect(spot?.reportCount).toBe(3);
    expect(spot?.openCount).toBe(2);
    expect(spot?.categories).toEqual([
      { categoryId: 'roads', name: 'Roads', count: 2 },
      { categoryId: 'water', name: 'Water', count: 1 },
    ]);
    expect(spot?.latestReportAt).toEqual(day(4));
    expect(spot?.reports.map((r) => r.createdAt)).toEqual([day(4), day(2), day(1)]);
    expect(spot?.recurring).toBe(false);
  });

  it('ranks by reports, then reports still open, then the latest report', () => {
    const spots = summarize([
      ...[1, 2, 3].map((n) => report({ clusterId: 1, createdAt: day(n), status: 'RESOLVED' })),
      ...[1, 2, 3, 4].map((n) => report({ clusterId: 2, createdAt: day(n) })),
      ...[1, 2, 3].map((n) => report({ clusterId: 3, createdAt: day(n) })),
      ...[1, 2, 9].map((n) => report({ clusterId: 4, createdAt: day(n) })),
    ]);
    expect(spots.map((s) => [s.reportCount, s.openCount, s.latestReportAt.getUTCDate()])).toEqual([
      [4, 4, 4],
      [3, 3, 9],
      [3, 3, 3],
      [3, 0, 3],
    ]);
  });

  it('caps the reports listed per hotspot and the hotspots returned', () => {
    const big = Array.from({ length: HOTSPOT_REPORTS_LISTED + 5 }, (_, n) =>
      report({ createdAt: day(n + 1) }),
    );
    expect(summarize(big)[0]?.reports).toHaveLength(HOTSPOT_REPORTS_LISTED);
    expect(summarize(big)[0]?.reportCount).toBe(HOTSPOT_REPORTS_LISTED + 5);

    const many = Array.from({ length: (HOTSPOT_LIMIT + 3) * 3 }, (_, n) =>
      report({ clusterId: Math.floor(n / 3) }),
    );
    expect(summarize(many)).toHaveLength(HOTSPOT_LIMIT);
  });
});

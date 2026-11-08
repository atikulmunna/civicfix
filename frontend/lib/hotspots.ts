import type { Hotspot } from './types';

/** Reach rounded up to 10 m: "within 90 m" reads better than "within 87 m". */
function reach(h: Hotspot): number {
  return Math.max(10, Math.ceil(h.radiusM / 10) * 10);
}

/** What gets reported there: "Roads", or "Roads and 2 other kinds". */
export function hotspotKinds(h: Hotspot): string {
  const [top, ...rest] = h.categories;
  if (!top) return 'Reports';
  if (rest.length === 0) return top.name;
  return `${top.name} and ${String(rest.length)} other ${rest.length === 1 ? 'kind' : 'kinds'}`;
}

/** "5 reports within 120 m, 3 still open." */
export function hotspotCounts(h: Hotspot): string {
  const open =
    h.openCount === 0
      ? 'all fixed'
      : h.openCount === h.reportCount
        ? 'none fixed yet'
        : `${String(h.openCount)} still open`;
  return `${String(h.reportCount)} reports within ${String(reach(h))} m, ${open}.`;
}

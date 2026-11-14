import { useTranslations } from 'next-intl';
import type { Hotspot } from './types';

/** Reach rounded up to 10 m: "within 90 m" reads better than "within 87 m". */
function reach(h: Hotspot): number {
  return Math.max(10, Math.ceil(h.radiusM / 10) * 10);
}

/** How a hotspot is described, in the chosen language (F4, F5). */
export function useHotspotText() {
  const t = useTranslations('hotspots');
  return {
    /** What gets reported there: "Roads", or "Roads and 2 other kinds". */
    kinds(h: Hotspot): string {
      const [top, ...rest] = h.categories;
      if (!top) return t('kindsUnknown');
      if (rest.length === 0) return top.name;
      return t('kindsMore', { top: top.name, others: rest.length });
    },
    /** "5 reports within 120 m, 3 still open." */
    counts(h: Hotspot): string {
      const open =
        h.openCount === 0
          ? t('openAll')
          : h.openCount === h.reportCount
            ? t('openNone')
            : t('openSome', { count: h.openCount });
      return t('counts', { reports: h.reportCount, reach: reach(h), open });
    },
  };
}

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { ReportStatus, Severity } from '@/lib/types';
import { deviceTimeZone } from './time-zone';

/** Dates, numbers and labels in the chosen language (F5). */
export interface Format {
  /** "Nov 11, 2026" / "১১ নভেম্বর, ২০২৬", on the device's clock. */
  date(iso: string): string;
  /** The date plus the time of day. */
  dateTime(iso: string): string;
  number(n: number): string;
  /** A share from 0 to 1 as a whole percentage. */
  rate(rate: number): string;
  /** "under 1 hour", "5 hours", "3 days". */
  duration(hours: number): string;
  status(status: ReportStatus): string;
  severity(severity: Severity): string;
}

export function useFormat(): Format {
  const format = useFormatter();
  const locale = useLocale();
  const t = useTranslations('format');
  const statusLabel = useTranslations('status');
  const severityLabel = useTranslations('severity');

  // Bangla month abbreviations read poorly, so Bangla spells the month out.
  const day = {
    year: 'numeric',
    month: locale === 'bn' ? 'long' : 'short',
    day: 'numeric',
  } as const;

  return {
    date: (iso) => format.dateTime(new Date(iso), { ...day, timeZone: deviceTimeZone() }),
    dateTime: (iso) =>
      format.dateTime(new Date(iso), {
        ...day,
        // Bangla's locale data writes a Latin AM/PM; its own day periods
        // (সকাল, দুপুর, বিকাল, রাত) keep the line in Bangla.
        ...(locale === 'bn'
          ? { hour: 'numeric', minute: '2-digit', dayPeriod: 'short' }
          : { hour: '2-digit', minute: '2-digit' }),
        timeZone: deviceTimeZone(),
      }),
    number: (n) => format.number(n),
    rate: (rate) => format.number(rate, { style: 'percent', maximumFractionDigits: 0 }),
    duration: (hours) => {
      if (hours < 1) return t('underAnHour');
      if (hours < 24) return t('hours', { count: Math.round(hours) });
      return t('days', { count: Math.round(hours / 24) });
    },
    status: (status) => statusLabel(status),
    severity: (severity) => severityLabel(severity),
  };
}

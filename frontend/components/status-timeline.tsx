import type { StatusHistoryEntry } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/use-format';

export function StatusTimeline({ entries }: { entries: StatusHistoryEntry[] }) {
  const t = useTranslations('report');
  const f = useFormat();
  if (entries.length === 0) return <p className="text-sm text-slate-500">{t('noHistory')}</p>;
  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {entries.map((e) => (
        <li key={e.id} className="mb-4 ml-4">
          <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-teal-500" />
          <p className="text-sm font-medium text-slate-900">
            {e.oldStatus
              ? t('statusChange', { from: f.status(e.oldStatus), to: f.status(e.newStatus) })
              : f.status(e.newStatus)}
          </p>
          {/* Notes are people's words: shown as written. */}
          {e.note && <p className="text-sm text-slate-600">{e.note}</p>}
          <p className="text-xs text-slate-400">
            {t('byLine', { name: e.changedBy.name, date: f.dateTime(e.createdAt) })}
          </p>
        </li>
      ))}
    </ol>
  );
}

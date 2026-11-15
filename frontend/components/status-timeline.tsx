import type { StatusHistoryEntry } from '@/lib/types';
import { useLocale, useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/use-format';

/**
 * A history entry's note for the reader (F5). English shows what the server
 * wrote; Bangla words automatic notes from their key. Notes people typed have
 * no key and are shown as written.
 */
function useNoteText(): (e: StatusHistoryEntry) => string | null {
  const locale = useLocale();
  const t = useTranslations('history.notes');
  return (e) => {
    // `== null`: an API older than the web app sends no key at all (deploy window).
    if (locale === 'en' || e.noteKey == null) return e.note;
    return t(e.noteKey, e.noteParams ?? {});
  };
}

export function StatusTimeline({ entries }: { entries: StatusHistoryEntry[] }) {
  const noteOf = useNoteText();
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
          {noteOf(e) && <p className="text-sm text-slate-600">{noteOf(e)}</p>}
          <p className="text-xs text-slate-400">
            {t('byLine', { name: e.changedBy.name, date: f.dateTime(e.createdAt) })}
          </p>
        </li>
      ))}
    </ol>
  );
}

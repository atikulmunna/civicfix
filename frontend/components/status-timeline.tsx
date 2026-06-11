import type { StatusHistoryEntry } from '@/lib/types';
import { formatDateTime, statusLabel } from '@/lib/format';

export function StatusTimeline({ entries }: { entries: StatusHistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No history yet.</p>;
  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {entries.map((e) => (
        <li key={e.id} className="mb-4 ml-4">
          <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-teal-500" />
          <p className="text-sm font-medium text-slate-900">
            {e.oldStatus ? `${statusLabel(e.oldStatus)} → ` : ''}
            {statusLabel(e.newStatus)}
          </p>
          {e.note && <p className="text-sm text-slate-600">{e.note}</p>}
          <p className="text-xs text-slate-400">
            {e.changedBy.name} · {formatDateTime(e.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import type { Report } from '@/lib/types';
import { assetUrl } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/use-format';
import { SeverityBadge, StatusBadge } from './badges';

export function ReportCard({
  report,
  hrefBase = '/reports',
  showPriority = false,
}: {
  report: Report;
  hrefBase?: string;
  /** Show the triage score (admin queues; closed reports score 0 and show none). */
  showPriority?: boolean;
}) {
  const t = useTranslations('report');
  const f = useFormat();
  const thumb = report.images?.[0]?.imageUrl;
  return (
    <Link
      href={`${hrefBase}/${report.id}`}
      className="group flex gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      {thumb ? (
        <Image
          src={assetUrl(thumb)}
          alt=""
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 rounded-xl object-cover ring-1 ring-slate-200/70"
        />
      ) : (
        <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
          <span className="text-2xl">📍</span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={report.status} />
          <SeverityBadge severity={report.severity} />
          {report.category && (
            <span className="text-xs text-slate-500">{report.category.name}</span>
          )}
          {showPriority && report.priorityScore > 0 && (
            <span
              className="ml-auto rounded-md bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums"
              title={t('priorityTitle')}
            >
              {t('priority', { score: f.number(report.priorityScore) })}
            </span>
          )}
        </div>
        <h3 className="mt-1 truncate font-semibold text-slate-900 transition group-hover:text-teal-700">
          {report.title}
        </h3>
        <p className="line-clamp-1 text-sm text-slate-600">{report.description}</p>
        <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-500">
          {report.counts && (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700"
                title={t('upvotes')}
              >
                ▲ {f.number(report.counts.upvotes)}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700"
                title={t('confirmations')}
              >
                ✓ {f.number(report.counts.confirms)}
              </span>
            </>
          )}
          {report.address && <span className="truncate text-slate-400">{report.address}</span>}
          <span className="ml-auto shrink-0 text-slate-400">{f.date(report.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

import Link from 'next/link';
import type { Report } from '@/lib/types';
import { assetUrl } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { SeverityBadge, StatusBadge } from './badges';

export function ReportCard({ report, hrefBase = '/reports' }: { report: Report; hrefBase?: string }) {
  const thumb = report.images?.[0]?.imageUrl;
  return (
    <Link
      href={`${hrefBase}/${report.id}`}
      className="group flex gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl(thumb)}
          alt=""
          className="h-24 w-24 shrink-0 rounded-xl object-cover ring-1 ring-slate-200/70"
          loading="lazy"
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
          {report.category && <span className="text-xs text-slate-500">{report.category.name}</span>}
        </div>
        <h3 className="mt-1 truncate font-semibold text-slate-900 transition group-hover:text-teal-700">
          {report.title}
        </h3>
        <p className="line-clamp-1 text-sm text-slate-600">{report.description}</p>
        <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-500">
          {report.counts && (
            <>
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700" title="Upvotes">
                ▲ {report.counts.upvotes}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700" title="Confirmations">
                ✓ {report.counts.confirms}
              </span>
            </>
          )}
          {report.address && <span className="truncate text-slate-400">{report.address}</span>}
          <span className="ml-auto shrink-0 text-slate-400">{formatDate(report.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

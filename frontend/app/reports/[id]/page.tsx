'use client';

import { use } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Report, StatusHistoryEntry } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { VoteBar } from '@/components/vote-bar';
import { StatusTimeline } from '@/components/status-timeline';
import { CommentSection } from '@/components/comment-section';
import { Card, LoadError, Spinner } from '@/components/ui';

/** Report detail for one id (separate from the page so it can be tested). */
export function ReportDetail({ id }: { id: string }) {
  const reportQuery = useQuery({
    queryKey: queryKeys.report(id),
    queryFn: ({ signal }) => api.get<{ report: Report }>(`/reports/${id}`, undefined, { signal }),
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.reportHistory(id),
    queryFn: ({ signal }) =>
      api.get<{ history: StatusHistoryEntry[] }>(`/reports/${id}/history`, undefined, { signal }),
  });

  if (reportQuery.isPending) return <Spinner />;
  if (reportQuery.isError) {
    return <LoadError>{errorMessage(reportQuery.error, 'Failed to load report.')}</LoadError>;
  }
  const report = reportQuery.data.report;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} />
            <SeverityBadge severity={report.severity} />
            {report.category && (
              <span className="text-sm text-slate-500">{report.category.name}</span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{report.title}</h1>
          <p className="mt-1 text-xs text-slate-400">Reported {formatDateTime(report.createdAt)}</p>
        </div>

        {report.images && report.images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {report.images.map((img) => (
              <div key={img.id} className="relative aspect-square w-full">
                <Image
                  src={assetUrl(img.imageUrl)}
                  alt={`${img.imageType} photo`}
                  fill
                  sizes="(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw"
                  className="rounded-md object-cover"
                />
              </div>
            ))}
          </div>
        )}

        <p className="whitespace-pre-line text-slate-700">{report.description}</p>

        {(report.address || report.landmark) && (
          <p className="text-sm text-slate-500">
            📍 {[report.address, report.landmark].filter(Boolean).join(' · ')}
          </p>
        )}

        <VoteBar
          reportId={report.id}
          initialCounts={report.counts ?? { upvotes: 0, confirms: 0, falseReports: 0 }}
        />

        <hr className="border-slate-200" />
        <CommentSection reportId={report.id} />
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Status history</h2>
          {historyQuery.isPending ? (
            <Spinner />
          ) : historyQuery.isError ? (
            <LoadError>
              {errorMessage(historyQuery.error, 'Failed to load the status history.')}
            </LoadError>
          ) : (
            <StatusTimeline entries={historyQuery.data.history} />
          )}
        </Card>
      </aside>
    </div>
  );
}

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ReportDetail id={id} />;
}

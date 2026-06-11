'use client';

import { use, useEffect, useState } from 'react';
import { api, ApiError, assetUrl } from '@/lib/api';
import type { Report, StatusHistoryEntry } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { VoteBar } from '@/components/vote-bar';
import { StatusTimeline } from '@/components/status-timeline';
import { CommentSection } from '@/components/comment-section';
import { Card, Spinner } from '@/components/ui';

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<{ report: Report }>(`/reports/${id}`),
      api.get<{ history: StatusHistoryEntry[] }>(`/reports/${id}/history`),
    ])
      .then(([r, h]) => {
        if (!active) return;
        setReport(r.report);
        setHistory(h.history);
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.message : 'Failed to load report.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <Spinner />;
  if (error || !report) return <p className="py-10 text-center text-sm text-red-700">{error ?? 'Not found.'}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} />
            <SeverityBadge severity={report.severity} />
            {report.category && <span className="text-sm text-slate-500">{report.category.name}</span>}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{report.title}</h1>
          <p className="mt-1 text-xs text-slate-400">Reported {formatDateTime(report.createdAt)}</p>
        </div>

        {report.images && report.images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {report.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={assetUrl(img.imageUrl)}
                alt={img.imageType}
                className="aspect-square w-full rounded-md object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}

        <p className="whitespace-pre-line text-slate-700">{report.description}</p>

        {(report.address || report.landmark) && (
          <p className="text-sm text-slate-500">
            📍 {[report.address, report.landmark].filter(Boolean).join(' · ')}
          </p>
        )}

        <VoteBar reportId={report.id} initialCounts={report.counts ?? { upvotes: 0, confirms: 0, falseReports: 0 }} />

        <hr className="border-slate-200" />
        <CommentSection reportId={report.id} />
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Status history</h2>
          <StatusTimeline entries={history} />
        </Card>
      </aside>
    </div>
  );
}

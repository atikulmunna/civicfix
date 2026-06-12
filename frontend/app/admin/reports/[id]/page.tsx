'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, assetUrl } from '@/lib/api';
import type { Department, Report, StatusHistoryEntry } from '@/lib/types';
import { STATUS_OPTIONS, formatDateTime, statusLabel } from '@/lib/format';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { StatusTimeline } from '@/components/status-timeline';
import { RequireAuth } from '@/components/require-auth';
import { useToast } from '@/components/toast';
import { Button, Card, Input, Label, Select, Spinner, Textarea } from '@/components/ui';

export function Moderation({ id }: { id: string }) {
  const { toast } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // action form state
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [duplicateOf, setDuplicateOf] = useState('');

  const load = useCallback(async () => {
    const [r, h] = await Promise.all([
      api.get<{ report: Report }>(`/reports/${id}`),
      api.get<{ history: StatusHistoryEntry[] }>(`/reports/${id}/history`),
    ]);
    setReport(r.report);
    setHistory(h.history);
  }, [id]);

  useEffect(() => {
    Promise.all([load(), api.get<{ departments: Department[] }>('/departments').then((d) => setDepartments(d.departments))])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await action();
      await load();
      toast(ok, 'success');
      setNote('');
      setInternalNote('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Action failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (!report) return <p className="py-10 text-center text-sm text-red-700">Report not found.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Link href="/admin/reports" className="text-sm text-teal-700 hover:underline">← Back to reports</Link>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} />
            <SeverityBadge severity={report.severity} />
            {report.category && <span className="text-sm text-slate-500">{report.category.name}</span>}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{report.title}</h1>
          <p className="text-xs text-slate-400">Reported {formatDateTime(report.createdAt)}</p>
        </div>

        {report.images && report.images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {report.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.id} src={assetUrl(img.imageUrl)} alt="" className="aspect-square rounded object-cover" loading="lazy" />
            ))}
          </div>
        )}

        <p className="whitespace-pre-line text-slate-700">{report.description}</p>
        {report.address && <p className="text-sm text-slate-500">📍 {report.address}</p>}
        <p className="text-sm">
          <Link href={`/reports/${report.id}`} className="text-teal-700 hover:underline">View public page →</Link>
        </p>

        {report.internalNote && (
          <Card className="border-amber-200 bg-amber-50">
            <p className="text-xs font-medium text-amber-800">Internal note</p>
            <p className="text-sm text-amber-900">{report.internalNote}</p>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Status history</h2>
          <StatusTimeline entries={history} />
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Update status</h2>
          <div className="flex flex-col gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="New status">
              <option value="">Select status…</option>
              {STATUS_OPTIONS.filter((s) => s !== report.status).map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </Select>
            <Textarea rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Status note" />
            <Textarea rows={2} placeholder="Internal note (required to reject)" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} aria-label="Internal note" />
            <Button
              disabled={busy || !status}
              onClick={() =>
                run(
                  () => api.patch(`/admin/reports/${id}/status`, {
                    status,
                    note: note || undefined,
                    internalNote: internalNote || undefined,
                  }),
                  'Status updated.',
                )
              }
            >
              Apply status
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Assign department</h2>
          <div className="flex flex-col gap-2">
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Department">
              <option value="">Select department…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <Button
              variant="secondary"
              disabled={busy || !departmentId}
              onClick={() => run(() => api.patch(`/admin/reports/${id}/assign`, { departmentId, note: note || undefined }), 'Report assigned.')}
            >
              Assign (sets Assigned)
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Other actions</h2>
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => api.post(`/admin/reports/${id}/resolve`, { note: note || undefined }), 'Marked resolved.')}
            >
              Resolve
            </Button>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dup">Mark as duplicate of</Label>
              <Input id="dup" placeholder="Original report ID" value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value)} />
              <Button
                variant="danger"
                disabled={busy || !duplicateOf}
                onClick={() => run(() => api.post(`/admin/reports/${id}/duplicate`, { duplicateOfReportId: duplicateOf }), 'Marked duplicate.')}
              >
                Mark duplicate
              </Button>
            </div>
          </div>
        </Card>
      </aside>
    </div>
  );
}

export default function AdminReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireAuth require="admin">
      <Moderation id={id} />
    </RequireAuth>
  );
}

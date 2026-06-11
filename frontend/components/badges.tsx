import type { ReportStatus, Severity } from '@/lib/types';
import { severityLabel, statusLabel } from '@/lib/format';

const STATUS_STYLES: Record<ReportStatus, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  VERIFIED: 'bg-blue-100 text-blue-800',
  ASSIGNED: 'bg-indigo-100 text-indigo-800',
  IN_PROGRESS: 'bg-cyan-100 text-cyan-800',
  RESOLVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  DUPLICATE: 'bg-slate-200 text-slate-600',
  NEEDS_MORE_INFO: 'bg-orange-100 text-orange-800',
  ARCHIVED: 'bg-slate-200 text-slate-500',
};

const SEVERITY_STYLES: Record<Severity, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

export function StatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`${base} ${STATUS_STYLES[status]}`}>{statusLabel(status)}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`${base} ${SEVERITY_STYLES[severity]}`}>{severityLabel(severity)}</span>;
}

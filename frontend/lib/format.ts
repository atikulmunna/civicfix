import type { ReportStatus, Severity } from './types';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function statusLabel(status: ReportStatus): string {
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function severityLabel(severity: Severity): string {
  return severity[0].toUpperCase() + severity.slice(1);
}

export const STATUS_OPTIONS: ReportStatus[] = [
  'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS',
  'RESOLVED', 'REJECTED', 'DUPLICATE', 'NEEDS_MORE_INFO', 'ARCHIVED',
];

export const SEVERITY_OPTIONS: Severity[] = ['low', 'medium', 'high', 'urgent'];

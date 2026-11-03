import type { ReportStatus, Severity } from './types';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "hello" -> "Hello" (empty string stays empty). */
function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function statusLabel(status: ReportStatus): string {
  return status.toLowerCase().split('_').map(capitalize).join(' ');
}

export function severityLabel(severity: Severity): string {
  return capitalize(severity);
}

export const STATUS_OPTIONS: ReportStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
  'DUPLICATE',
  'NEEDS_MORE_INFO',
  'ARCHIVED',
];

export const SEVERITY_OPTIONS: Severity[] = ['low', 'medium', 'high', 'urgent'];

/**
 * Narrows a <select> or URL value to a report status. Anything else (empty,
 * unknown) means "any status", so a bad value never reaches the API.
 */
export function asStatus(value: string | null | undefined): ReportStatus | undefined {
  return STATUS_OPTIONS.find((s) => s === value);
}

/** Like asStatus, for severities. */
export function asSeverity(value: string | null | undefined): Severity | undefined {
  return SEVERITY_OPTIONS.find((s) => s === value);
}

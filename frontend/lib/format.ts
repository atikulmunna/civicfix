import type { ReportStatus, Severity } from './types';

// Labels, dates and durations for people to read come from useFormat
// (lib/i18n/use-format.ts), in the reader's language. This file keeps the
// language-free lists and checks.

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

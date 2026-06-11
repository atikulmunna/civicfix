import type { ReportStatus } from './types';

/** Marker fill colour by status (for at-a-glance map reading). */
export function statusColor(status: ReportStatus): string {
  switch (status) {
    case 'RESOLVED':
      return '#16a34a'; // green-600
    case 'REJECTED':
    case 'DUPLICATE':
    case 'ARCHIVED':
      return '#94a3b8'; // slate-400
    case 'IN_PROGRESS':
      return '#0891b2'; // cyan-600
    case 'ASSIGNED':
      return '#4f46e5'; // indigo-600
    case 'VERIFIED':
      return '#2563eb'; // blue-600
    case 'NEEDS_MORE_INFO':
      return '#ea580c'; // orange-600
    default:
      return '#64748b'; // slate-500 (submitted/under_review)
  }
}

/** Format a Leaflet-style bounds into the backend bbox query string. */
export function bboxString(b: {
  west: number;
  south: number;
  east: number;
  north: number;
}): string {
  return `${b.west},${b.south},${b.east},${b.north}`;
}

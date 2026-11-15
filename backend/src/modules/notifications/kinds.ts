/**
 * Notification kinds (F5). Each notification stores what happened (`kind`) and
 * the values its wording needs (`params`), beside the English title and
 * message it has always had. The web app words a kinded notification in the
 * reader's language; rows stored before kinds keep their English.
 */
import type { z } from 'zod';
import type { ReportStatus } from '../../generated/prisma/client.js';
import { NOTIFICATION_PARAMS } from '../../contract/schemas.js';

export type NotificationKind = keyof typeof NOTIFICATION_PARAMS;

/** A kind with params that fit it. */
export type KindedNotice = {
  [K in NotificationKind]: { kind: K; params: z.infer<(typeof NOTIFICATION_PARAMS)[K]> };
}[NotificationKind];

/** Human-readable status for the English message: "in progress". */
function readableStatus(status: ReportStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

/** The English title and message, exactly as the API has always written them. */
export function notificationEnglish(notice: KindedNotice): { title: string; message: string } {
  switch (notice.kind) {
    case 'status_changed':
      return {
        title: 'Report status updated',
        message: `Your report "${notice.params.reportTitle}" is now ${readableStatus(notice.params.status)}.`,
      };
    case 'report_merged':
      return {
        title: 'Report status updated',
        message:
          `Your report "${notice.params.reportTitle}" was merged into "${notice.params.originalTitle}", ` +
          'which reports the same problem. You will get its updates from now on.',
      };
    case 'fix_disputed':
      return {
        title: 'Fix disputed',
        message: `Residents disputed the fix for "${notice.params.reportTitle}". It is back in progress.`,
      };
  }
}

/**
 * A stored row's kind and params when they are a known kind with params that
 * fit it; otherwise null, and the row shows its stored English.
 */
export function readKind(kind: string | null, params: unknown): KindedNotice | null {
  switch (kind) {
    case 'status_changed': {
      const parsed = NOTIFICATION_PARAMS.status_changed.safeParse(params);
      return parsed.success ? { kind, params: parsed.data } : null;
    }
    case 'report_merged': {
      const parsed = NOTIFICATION_PARAMS.report_merged.safeParse(params);
      return parsed.success ? { kind, params: parsed.data } : null;
    }
    case 'fix_disputed': {
      const parsed = NOTIFICATION_PARAMS.fix_disputed.safeParse(params);
      return parsed.success ? { kind, params: parsed.data } : null;
    }
    default:
      return null;
  }
}

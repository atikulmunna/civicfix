/**
 * Automatic history notes (F5). The server writes a few notes itself; each
 * keeps its English `note` and also stores a key and values, so the web app
 * can word it in the reader's language. Notes people type have no key and are
 * shown as written.
 */
import type { z } from 'zod';
import { HISTORY_NOTE_PARAMS } from '../../contract/schemas.js';

type NoteKey = keyof typeof HISTORY_NOTE_PARAMS;

/** An automatic note: its key and the values its wording needs. */
export type HistoryNote = {
  [K in NoteKey]: { key: K; params: z.infer<(typeof HISTORY_NOTE_PARAMS)[K]> };
}[NoteKey];

/** The English note, exactly as the API has always written it. */
export function historyNoteEnglish(note: HistoryNote): string {
  switch (note.key) {
    case 'report.submitted':
      return 'Report submitted.';
    case 'report.merged':
      return `Merged into "${note.params.originalTitle}".`;
    case 'report.reopenedByDisputes':
      return `Reopened: ${String(note.params.count)} residents disputed the fix with photos.`;
  }
}

/** A history row's key and values as the API sends them: both null unless they fit. */
export function readHistoryNote(
  key: string | null,
  params: unknown,
):
  | { noteKey: NoteKey; noteParams: Record<string, string | number> }
  | {
      noteKey: null;
      noteParams: null;
    } {
  switch (key) {
    case 'report.submitted':
    case 'report.merged':
    case 'report.reopenedByDisputes': {
      const parsed = HISTORY_NOTE_PARAMS[key].safeParse(params);
      return parsed.success
        ? { noteKey: key, noteParams: parsed.data }
        : { noteKey: null, noteParams: null };
    }
    default:
      return { noteKey: null, noteParams: null };
  }
}

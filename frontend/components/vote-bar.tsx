'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { invalidateReportLists } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import type { Report, ReportViewerState, VoteCounts } from '@/lib/types';
import { useAuth } from './auth-context';
import { useToast } from './toast';

type Vote = 'upvote' | 'confirm' | 'false-report';

const VERB: Record<Vote, string> = {
  upvote: 'upvote',
  confirm: 'confirm',
  'false-report': 'flag this report',
};

/**
 * Vote + follow actions. Which toggles are on starts from the API (the report's
 * `viewer` state) and follows each response, so it survives reloads; the
 * cached report is kept in step.
 */
const NOTHING_YET: ReportViewerState = {
  upvoted: false,
  confirmed: false,
  flagged: false,
  following: false,
};

export function VoteBar({
  reportId,
  initialCounts,
  initialViewer = NOTHING_YET,
}: {
  reportId: string;
  initialCounts: VoteCounts;
  /** The signed-in viewer's votes and follow, from the report detail. */
  initialViewer?: ReportViewerState;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [counts, setCounts] = useState(initialCounts);
  const [viewer, setViewer] = useState(initialViewer);

  /** Apply a change here and to the cached report, so it survives navigation. */
  function updateViewer(change: Partial<ReportViewerState>, nextCounts?: VoteCounts) {
    setViewer((v) => ({ ...v, ...change }));
    queryClient.setQueryData<{ report: Report }>(queryKeys.report(reportId), (d) =>
      d
        ? {
            report: {
              ...d.report,
              ...(nextCounts && { counts: nextCounts }),
              ...(d.report.viewer && { viewer: { ...d.report.viewer, ...change } }),
            },
          }
        : d,
    );
  }

  const castVote = useMutation({
    mutationFn: ({ vote, undo }: { vote: Vote; undo: boolean }) =>
      undo && vote !== 'false-report'
        ? api.del(`/reports/${reportId}/${vote}`)
        : api.post(`/reports/${reportId}/${vote}`),
    onSuccess: ({ counts: next }, { vote, undo }) => {
      setCounts(next);
      updateViewer(
        vote === 'upvote'
          ? { upvoted: !undo }
          : vote === 'confirm'
            ? { confirmed: !undo, ...(!undo && { following: true }) } // confirming auto-follows
            : { flagged: true },
        next,
      );
      if (vote === 'false-report') toast('Flagged as possibly false. Thanks.', 'success');
      // Every list showing counts or priority goes stale too.
      void invalidateReportLists(queryClient);
    },
    onError: (err, { vote }) => toast(errorMessage(err, `Could not ${VERB[vote]}.`), 'error'),
  });

  const follow = useMutation({
    mutationFn: (undo: boolean) =>
      undo ? api.del(`/reports/${reportId}/follow`) : api.post(`/reports/${reportId}/follow`),
    onSuccess: ({ following }) => updateViewer({ following }),
    onError: (err) => toast(errorMessage(err, 'Could not follow.'), 'error'),
  });

  const busy = castVote.isPending || follow.isPending;

  if (!user) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Link href="/login" className="font-medium text-teal-700 hover:underline">
          Sign in
        </Link>{' '}
        to upvote, confirm, or follow this report.
        <div className="mt-2 flex gap-4 text-slate-500">
          <span>▲ {counts.upvotes} upvotes</span>
          <span>✓ {counts.confirms} confirmations</span>
        </div>
      </div>
    );
  }

  const toggleUpvote = () => castVote.mutate({ vote: 'upvote', undo: viewer.upvoted });
  const toggleConfirm = () => castVote.mutate({ vote: 'confirm', undo: viewer.confirmed });
  const flagFalse = () => castVote.mutate({ vote: 'false-report', undo: false });
  const toggleFollow = () => follow.mutate(viewer.following);

  const btn = 'rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50';

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={toggleUpvote}
        disabled={busy}
        aria-pressed={viewer.upvoted}
        className={`${btn} ${viewer.upvoted ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
      >
        ▲ Upvote · {counts.upvotes}
      </button>
      <button
        onClick={toggleConfirm}
        disabled={busy}
        aria-pressed={viewer.confirmed}
        className={`${btn} ${viewer.confirmed ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
      >
        ✓ Confirm · {counts.confirms}
      </button>
      <button
        onClick={toggleFollow}
        disabled={busy}
        aria-pressed={viewer.following}
        className={`${btn} ${viewer.following ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
      >
        {viewer.following ? 'Following' : 'Follow'}
      </button>
      <button
        onClick={flagFalse}
        // A flag cannot be withdrawn (the API has no undo for it).
        disabled={busy || viewer.flagged}
        className={`${btn} border-slate-300 text-slate-500 hover:bg-slate-50`}
      >
        {viewer.flagged ? 'Flagged' : 'Flag as false'}
      </button>
    </div>
  );
}

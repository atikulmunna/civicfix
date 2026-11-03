'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { invalidateReportLists } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import type { Report, VoteCounts } from '@/lib/types';
import { useAuth } from './auth-context';
import { useToast } from './toast';

type Vote = 'upvote' | 'confirm' | 'false-report';

const VERB: Record<Vote, string> = {
  upvote: 'upvote',
  confirm: 'confirm',
  'false-report': 'flag this report',
};

/**
 * Vote + follow actions. The API is idempotent and doesn't expose per-user
 * state, so which toggles are on is tracked within this session; counts and
 * the follow state come from the API's responses.
 */
export function VoteBar({
  reportId,
  initialCounts,
}: {
  reportId: string;
  initialCounts: VoteCounts;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [counts, setCounts] = useState(initialCounts);
  const [upvoted, setUpvoted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [following, setFollowing] = useState(false);

  const castVote = useMutation({
    mutationFn: ({ vote, undo }: { vote: Vote; undo: boolean }) =>
      undo && vote !== 'false-report'
        ? api.del(`/reports/${reportId}/${vote}`)
        : api.post(`/reports/${reportId}/${vote}`),
    onSuccess: ({ counts: next }, { vote, undo }) => {
      setCounts(next);
      if (vote === 'upvote') setUpvoted(!undo);
      if (vote === 'confirm') {
        setConfirmed(!undo);
        if (!undo) setFollowing(true); // confirming auto-follows
      }
      if (vote === 'false-report') toast('Flagged as possibly false. Thanks.', 'success');
      // Keep the cached report and every list showing counts in step.
      queryClient.setQueryData<{ report: Report }>(queryKeys.report(reportId), (d) =>
        d ? { report: { ...d.report, counts: next } } : d,
      );
      void invalidateReportLists(queryClient);
    },
    onError: (err, { vote }) => toast(errorMessage(err, `Could not ${VERB[vote]}.`), 'error'),
  });

  const follow = useMutation({
    mutationFn: (undo: boolean) =>
      undo ? api.del(`/reports/${reportId}/follow`) : api.post(`/reports/${reportId}/follow`),
    onSuccess: ({ following: now }) => setFollowing(now),
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

  const toggleUpvote = () => castVote.mutate({ vote: 'upvote', undo: upvoted });
  const toggleConfirm = () => castVote.mutate({ vote: 'confirm', undo: confirmed });
  const flagFalse = () => castVote.mutate({ vote: 'false-report', undo: false });
  const toggleFollow = () => follow.mutate(following);

  const btn = 'rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50';

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={toggleUpvote}
        disabled={busy}
        className={`${btn} ${upvoted ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
      >
        ▲ Upvote · {counts.upvotes}
      </button>
      <button
        onClick={toggleConfirm}
        disabled={busy}
        className={`${btn} ${confirmed ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
      >
        ✓ Confirm · {counts.confirms}
      </button>
      <button
        onClick={toggleFollow}
        disabled={busy}
        className={`${btn} ${following ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
      >
        {following ? 'Following' : 'Follow'}
      </button>
      <button
        onClick={flagFalse}
        disabled={busy}
        className={`${btn} border-slate-300 text-slate-500 hover:bg-slate-50`}
      >
        Flag as false
      </button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { VoteCounts } from '@/lib/types';
import { useAuth } from './auth-context';
import { useToast } from './toast';

/**
 * Vote + follow actions. The API is idempotent and doesn't expose per-user
 * state, so toggles are tracked optimistically within this session.
 */
export function VoteBar({ reportId, initialCounts }: { reportId: string; initialCounts: VoteCounts }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [counts, setCounts] = useState(initialCounts);
  const [upvoted, setUpvoted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

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

  async function act(fn: () => Promise<void>, label: string) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : `Could not ${label}.`, 'error');
    } finally {
      setBusy(false);
    }
  }

  const toggleUpvote = () =>
    act(async () => {
      const { counts: c } = upvoted
        ? await api.del<{ counts: VoteCounts }>(`/reports/${reportId}/upvote`)
        : await api.post<{ counts: VoteCounts }>(`/reports/${reportId}/upvote`);
      setCounts(c);
      setUpvoted((v) => !v);
    }, 'upvote');

  const toggleConfirm = () =>
    act(async () => {
      const { counts: c } = confirmed
        ? await api.del<{ counts: VoteCounts }>(`/reports/${reportId}/confirm`)
        : await api.post<{ counts: VoteCounts }>(`/reports/${reportId}/confirm`);
      setCounts(c);
      setConfirmed((v) => !v);
      if (!confirmed) setFollowing(true); // confirming auto-follows
    }, 'confirm');

  const flagFalse = () =>
    act(async () => {
      const { counts: c } = await api.post<{ counts: VoteCounts }>(`/reports/${reportId}/false-report`);
      setCounts(c);
      toast('Flagged as possibly false. Thanks.', 'success');
    }, 'flag');

  const toggleFollow = () =>
    act(async () => {
      if (following) await api.del(`/reports/${reportId}/follow`);
      else await api.post(`/reports/${reportId}/follow`);
      setFollowing((v) => !v);
    }, 'follow');

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
      <button onClick={flagFalse} disabled={busy} className={`${btn} border-slate-300 text-slate-500 hover:bg-slate-50`}>
        Flag as false
      </button>
    </div>
  );
}

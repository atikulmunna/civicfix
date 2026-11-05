'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { invalidateReportLists } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import { formatMegabytes, resizeImage, UPLOAD_BUDGET_BYTES } from '@/lib/resize-image';
import type { FixCheck, FixChecks as FixChecksData, FixVerdict } from '@/lib/types';
import { useAuth } from './auth-context';
import { useToast } from './toast';
import { Button, FieldError, Label, LoadError, Spinner } from './ui';

const VERDICTS: Record<
  FixVerdict,
  { ask: string; send: string; mine: string; listed: string; pressed: string; text: string }
> = {
  confirmed: {
    ask: "Yes, it's fixed",
    send: 'Send confirmation',
    mine: 'You confirmed this fix.',
    listed: 'Confirmed the fix',
    pressed: 'border-green-600 bg-green-50 text-green-700',
    text: 'text-green-700',
  },
  disputed: {
    ask: 'No, still a problem',
    send: 'Send dispute',
    mine: 'You disputed this fix.',
    listed: 'Disputed the fix',
    pressed: 'border-red-600 bg-red-50 text-red-700',
    text: 'text-red-700',
  },
};

function CheckForm({ reportId, disputesToReopen }: { reportId: string; disputesToReopen: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [verdict, setVerdict] = useState<FixVerdict | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Resizing happens before the request; the mutation covers the upload.
  const [preparing, setPreparing] = useState(false);

  const send = useMutation({
    mutationFn: (check: { verdict: FixVerdict; photo: File }) => {
      const form = new FormData();
      form.set('verdict', check.verdict);
      form.set('photo', check.photo);
      return api.postForm(`/reports/${reportId}/fix-checks`, form);
    },
    onSuccess: async ({ reopened }, check) => {
      toast(
        reopened
          ? `Dispute sent. With ${String(disputesToReopen)} disputes, the report goes back to the department.`
          : check.verdict === 'confirmed'
            ? 'Confirmation sent. Thanks for checking.'
            : 'Dispute sent. Thanks for checking.',
        'success',
      );
      setVerdict(null);
      setPhoto(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.fixChecks(reportId) });
      if (reopened) {
        // The report's status changed: its page, history, lists and scores.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.report(reportId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.reportHistory(reportId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.scorecards }),
          invalidateReportLists(queryClient),
        ]);
      }
    },
    onError: (err) => setError(errorMessage(err, 'Could not send your check.')),
  });

  function choose(next: FixVerdict | null) {
    setVerdict(next);
    setError(null);
    if (!next) setPhoto(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!verdict) return;
    if (!photo) return setError('Add a photo of how it looks now.');
    setError(null);
    setPreparing(true);
    const prepared = await resizeImage(photo);
    setPreparing(false);
    if (prepared.size > UPLOAD_BUDGET_BYTES) {
      return setError(
        `This photo is ${formatMegabytes(prepared.size)}, over the ${formatMegabytes(UPLOAD_BUDGET_BYTES)} limit. Choose a smaller one.`,
      );
    }
    send.mutate({ verdict, photo: prepared });
  }

  const busy = preparing || send.isPending;
  const btn = 'rounded-md border px-3 py-1.5 text-sm font-medium transition';

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div role="group" aria-label="Your check" className="flex flex-wrap gap-2">
        {(['confirmed', 'disputed'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={verdict === v}
            disabled={busy}
            onClick={() => choose(verdict === v ? null : v)}
            className={`${btn} ${verdict === v ? VERDICTS[v].pressed : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            {VERDICTS[v].ask}
          </button>
        ))}
      </div>
      {verdict && (
        <>
          <div>
            <Label htmlFor="fix-photo">Photo of how it looks now</Label>
            <input
              id="fix-photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-describedby="fix-photo-hint"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
            />
            <p id="fix-photo-hint" className="mt-1 text-xs text-slate-500">
              Take it from about where the report&apos;s photo was taken, so the two compare.
            </p>
            <FieldError>{error}</FieldError>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending…' : VERDICTS[verdict].send}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => choose(null)}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

/** What the viewer can do about the current fix. */
function YourPart({ reportId, data }: { reportId: string; data: FixChecksData }) {
  const { user } = useAuth();
  if (!user) {
    return (
      <p className="text-sm text-slate-600">
        <Link href="/login" className="font-medium text-teal-700 hover:underline">
          Sign in
        </Link>{' '}
        to check this fix.
      </p>
    );
  }
  const viewer = data.viewer;
  if (!viewer) return null; // signed in a moment ago: the refetch brings it
  if (viewer.verdict) {
    return (
      <p className={`text-sm font-medium ${VERDICTS[viewer.verdict].text}`}>
        {VERDICTS[viewer.verdict].mine}
      </p>
    );
  }
  if (viewer.canCheck) {
    return <CheckForm reportId={reportId} disputesToReopen={data.disputesToReopen} />;
  }
  return (
    <p className="text-sm text-slate-500">
      Fixes are checked by residents, not by admins or the department that made them.
    </p>
  );
}

function CheckList({
  checks,
  total,
  currentFix,
}: {
  checks: FixCheck[];
  total: number;
  currentFix: string | null;
}) {
  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-3">
            <a
              href={assetUrl(c.imageUrl)}
              target="_blank"
              rel="noreferrer"
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              <Image
                src={assetUrl(c.imageUrl)}
                alt={`Photo from ${c.author.name}, open full size`}
                fill
                sizes="80px"
                className="object-cover"
              />
            </a>
            <div className="text-sm">
              <p className={`font-medium ${VERDICTS[c.verdict].text}`}>
                {VERDICTS[c.verdict].listed}
              </p>
              <p className="text-slate-700">{c.author.name}</p>
              <p className="text-xs text-slate-400">
                {formatDateTime(c.createdAt)}
                {/* Only worth saying once a newer fix is waiting for checks. */}
                {currentFix && c.resolvedAt !== currentFix && ', of an earlier fix'}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {total > checks.length && (
        <p className="mt-2 text-sm text-slate-500">
          Showing the {checks.length} newest of {total}.
        </p>
      )}
    </div>
  );
}

/**
 * Residents' checks of a fix (F3): while the report is resolved, whether it
 * really is, with a photo; afterwards, the checks that were made.
 */
export function FixChecks({ reportId, resolved }: { reportId: string; resolved: boolean }) {
  const query = useQuery({
    queryKey: queryKeys.fixChecks(reportId),
    queryFn: ({ signal }) => api.get(`/reports/${reportId}/fix-checks`, undefined, { signal }),
  });

  // Only a resolved report is sure to have something here, so only it waits visibly.
  if (query.isPending) return resolved ? <Spinner label="Loading fix checks…" /> : null;
  if (query.isError) {
    return <LoadError>{errorMessage(query.error, 'Failed to load the fix checks.')}</LoadError>;
  }
  const data = query.data;
  const current = data.current;
  if (!current && data.total === 0) return null; // no fix to check, and none checked

  return (
    <section
      aria-labelledby="fix-checks-heading"
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div>
        <h2 id="fix-checks-heading" className="text-lg font-semibold text-slate-900">
          {current ? 'Is it fixed?' : 'Fix checks'}
        </h2>
        {current && (
          <>
            <p className="mt-1 text-sm text-slate-600">
              Marked resolved {formatDateTime(current.resolvedAt)}. Residents check the fix with a
              photo, and {data.disputesToReopen} disputes send it back to the department.
            </p>
            <p className="mt-2 text-sm font-medium tabular-nums text-slate-900">
              {current.confirmed} confirmed, {current.disputed} disputed
            </p>
          </>
        )}
      </div>
      {current && <YourPart reportId={reportId} data={data} />}
      {data.checks.length > 0 ? (
        <CheckList
          checks={data.checks}
          total={data.total}
          currentFix={current?.resolvedAt ?? null}
        />
      ) : (
        <p className="text-sm text-slate-500">No one has checked this fix yet.</p>
      )}
    </section>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { useFormat } from '@/lib/i18n/use-format';
import { invalidateReportLists } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import { megabytes, resizeImage, UPLOAD_BUDGET_BYTES } from '@/lib/resize-image';
import type { FixCheck, FixChecks as FixChecksData, FixVerdict } from '@/lib/types';
import { useAuth } from './auth-context';
import { useToast } from './toast';
import { Button, FieldError, Label, LoadError, Spinner } from './ui';

const VERDICT_STYLES: Record<FixVerdict, { pressed: string; text: string }> = {
  confirmed: { pressed: 'border-green-600 bg-green-50 text-green-700', text: 'text-green-700' },
  disputed: { pressed: 'border-red-600 bg-red-50 text-red-700', text: 'text-red-700' },
};

function CheckForm({ reportId, disputesToReopen }: { reportId: string; disputesToReopen: number }) {
  const t = useTranslations('fixChecks');
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
          ? t('reopened', { needed: disputesToReopen })
          : check.verdict === 'confirmed'
            ? t('sentConfirmed')
            : t('sentDisputed'),
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
    onError: (err) => setError(errorMessage(err, t('sendError'))),
  });

  function choose(next: FixVerdict | null) {
    setVerdict(next);
    setError(null);
    if (!next) setPhoto(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!verdict) return;
    if (!photo) return setError(t('addPhoto'));
    setError(null);
    setPreparing(true);
    const prepared = await resizeImage(photo);
    setPreparing(false);
    if (prepared.size > UPLOAD_BUDGET_BYTES) {
      return setError(
        t('tooBig', { size: megabytes(prepared.size), limit: megabytes(UPLOAD_BUDGET_BYTES) }),
      );
    }
    send.mutate({ verdict, photo: prepared });
  }

  const busy = preparing || send.isPending;
  const btn = 'rounded-md border px-3 py-1.5 text-sm font-medium transition';

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div role="group" aria-label={t('yourCheck')} className="flex flex-wrap gap-2">
        {(['confirmed', 'disputed'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={verdict === v}
            disabled={busy}
            onClick={() => choose(verdict === v ? null : v)}
            className={`${btn} ${verdict === v ? VERDICT_STYLES[v].pressed : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            {t(`${v}.ask`)}
          </button>
        ))}
      </div>
      {verdict && (
        <>
          <div>
            <Label htmlFor="fix-photo">{t('photoLabel')}</Label>
            <input
              id="fix-photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-describedby="fix-photo-hint"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
            />
            <p id="fix-photo-hint" className="mt-1 text-xs text-slate-500">
              {t('photoHint')}
            </p>
            <FieldError>{error}</FieldError>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('sending') : t(`${verdict}.send`)}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => choose(null)}>
              {t('cancel')}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

/** What the viewer can do about the current fix. */
function YourPart({ reportId, data }: { reportId: string; data: FixChecksData }) {
  const t = useTranslations('fixChecks');
  const { user } = useAuth();
  if (!user) {
    return (
      <p className="text-sm text-slate-600">
        {t.rich('signInPrompt', {
          link: (chunks) => (
            <Link href="/login" className="font-medium text-teal-700 hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    );
  }
  const viewer = data.viewer;
  if (!viewer) return null; // signed in a moment ago: the refetch brings it
  if (viewer.verdict) {
    return (
      <p className={`text-sm font-medium ${VERDICT_STYLES[viewer.verdict].text}`}>
        {t(`${viewer.verdict}.mine`)}
      </p>
    );
  }
  if (viewer.canCheck) {
    return <CheckForm reportId={reportId} disputesToReopen={data.disputesToReopen} />;
  }
  return <p className="text-sm text-slate-500">{t('staffNote')}</p>;
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
  const t = useTranslations('fixChecks');
  const f = useFormat();
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
                alt={t('photoAlt', { name: c.author.name })}
                fill
                sizes="80px"
                className="object-cover"
              />
            </a>
            <div className="text-sm">
              <p className={`font-medium ${VERDICT_STYLES[c.verdict].text}`}>
                {t(`${c.verdict}.listed`)}
              </p>
              <p className="text-slate-700">{c.author.name}</p>
              <p className="text-xs text-slate-400">
                {/* "Earlier" is only worth saying once a newer fix is waiting for checks. */}
                {currentFix && c.resolvedAt !== currentFix
                  ? t('earlierFixDate', { date: f.dateTime(c.createdAt) })
                  : f.dateTime(c.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {total > checks.length && (
        <p className="mt-2 text-sm text-slate-500">
          {t('cutShort', { shown: checks.length, total })}
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
  const t = useTranslations('fixChecks');
  const f = useFormat();
  const query = useQuery({
    queryKey: queryKeys.fixChecks(reportId),
    queryFn: ({ signal }) => api.get(`/reports/${reportId}/fix-checks`, undefined, { signal }),
  });

  // Only a resolved report is sure to have something here, so only it waits visibly.
  if (query.isPending) return resolved ? <Spinner label={t('loading')} /> : null;
  if (query.isError) {
    return <LoadError>{errorMessage(query.error, t('loadError'))}</LoadError>;
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
          {current ? t('headingOpen') : t('headingClosed')}
        </h2>
        {current && (
          <>
            <p className="mt-1 text-sm text-slate-600">
              {t('markedResolved', {
                date: f.dateTime(current.resolvedAt),
                needed: data.disputesToReopen,
              })}
            </p>
            <p className="mt-2 text-sm font-medium tabular-nums text-slate-900">
              {t('tally', { confirmed: current.confirmed, disputed: current.disputed })}
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
        <p className="text-sm text-slate-500">{t('noneYet')}</p>
      )}
    </section>
  );
}

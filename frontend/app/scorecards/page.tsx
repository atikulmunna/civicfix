'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { SEVERITY_OPTIONS } from '@/lib/format';
import { useFormat } from '@/lib/i18n/use-format';
import { queryKeys } from '@/lib/query-keys';
import type { DepartmentScorecard, Scorecards } from '@/lib/types';
import { SeverityBadge } from '@/components/badges';
import { LoadError, PageHeader, Spinner } from '@/components/ui';

/** A measured value, or a quiet "No data": never a zero nobody measured. */
function Measure({ children }: { children: ReactNode }) {
  const t = useTranslations('scorecards');
  return children === null ? (
    <span className="text-slate-400">{t('noData')}</span>
  ) : (
    <>{children}</>
  );
}

const orNull = <T,>(value: T | null, format: (v: T) => string) =>
  value === null ? null : format(value);

/** The one sentence this page exists to say. */
function Statement({ overdue }: { overdue: number }) {
  const t = useTranslations('scorecards');
  return (
    <p className="max-w-3xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
      {t('statement', { count: overdue })}
    </p>
  );
}

function ComparisonTable({ departments }: { departments: DepartmentScorecard[] }) {
  const t = useTranslations('scorecards');
  const f = useFormat();
  const header = 'px-3 py-2 text-left align-bottom text-sm font-medium text-slate-500';
  // No text colour here: the row sets it, and the overdue cell overrides it.
  const cell = 'px-3 py-3 align-top tabular-nums';
  return (
    <div
      className="overflow-x-auto border-t-2 border-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600"
      // Scrollable on narrow screens, so keyboard users need to reach it.
      tabIndex={0}
      role="region"
      aria-label={t('region')}
    >
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th scope="col" className={`${header} pl-0`}>
              {t('columns.department')}
            </th>
            <th scope="col" className={header}>
              {t('columns.overdueNow')}
            </th>
            <th scope="col" className={header}>
              {t('columns.resolved')}
            </th>
            <th scope="col" className={header}>
              {t('columns.respondedOnTime')}
            </th>
            <th scope="col" className={header}>
              {t('columns.resolvedOnTime')}
            </th>
            <th scope="col" className={header}>
              {t('columns.typicalResponse')}
            </th>
            <th scope="col" className={header}>
              {t('columns.typicalResolve')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-900">
          {departments.map((d) => (
            <tr key={d.departmentId}>
              <th scope="row" className="py-3 pl-0 pr-3 text-left align-top font-medium">
                {d.name}
              </th>
              <td
                className={`${cell} ${d.overdueCount > 0 ? 'font-semibold text-red-700' : 'text-slate-500'}`}
              >
                {f.number(d.overdueCount)}
              </td>
              <td className={cell}>
                <Measure>{orNull(d.resolutionRate, f.rate)}</Measure>
                <span className="block text-xs text-slate-500">
                  {t('resolvedOf', { resolved: d.resolved, assigned: d.assigned })}
                </span>
              </td>
              <td className={cell}>
                <Measure>{orNull(d.respondedOnTimeRate, f.rate)}</Measure>
              </td>
              <td className={cell}>
                <Measure>{orNull(d.resolvedOnTimeRate, f.rate)}</Measure>
              </td>
              <td className={cell}>
                <Measure>{orNull(d.medianResponseHours, f.duration)}</Measure>
              </td>
              <td className={cell}>
                <Measure>{orNull(d.medianResolveHours, f.duration)}</Measure>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverdueReports({ departments }: { departments: DepartmentScorecard[] }) {
  const t = useTranslations('scorecards');
  const f = useFormat();
  return (
    <section aria-labelledby="overdue-heading" className="max-w-3xl">
      <h2 id="overdue-heading" className="text-xl font-semibold text-slate-900">
        {t('overdueHeading')}
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        {departments.map((d) => (
          <div key={d.departmentId}>
            <h3 className="font-medium text-slate-900">{d.name}</h3>
            {d.overdueCount > d.overdue.length && (
              <p className="text-sm text-slate-500">
                {t('cutShort', { shown: d.overdue.length, total: d.overdueCount })}
              </p>
            )}
            <ul className="mt-1 divide-y divide-slate-100">
              {d.overdue.map((o) => (
                <li
                  key={o.reportId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <SeverityBadge severity={o.severity} />
                    <Link href={`/reports/${o.reportId}`} className="text-teal-700 hover:underline">
                      {o.title}
                    </Link>
                  </span>
                  <span className="tabular-nums text-red-700">
                    {t('overTarget', { duration: f.duration(o.hoursOverdue) })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowMeasured({ data }: { data: Scorecards }) {
  const t = useTranslations('scorecards.method');
  const f = useFormat();
  return (
    <section aria-labelledby="method-heading" className="max-w-2xl">
      <h2 id="method-heading" className="text-xl font-semibold text-slate-900">
        {t('heading')}
      </h2>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('severity')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('responseWithin')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('resolvedWithin')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {[...SEVERITY_OPTIONS].reverse().map((s) => (
            <tr key={s}>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-slate-900">
                {f.severity(s)}
              </th>
              <td className="py-2 pr-3 tabular-nums">{f.duration(data.targets.response[s])}</td>
              <td className="py-2 tabular-nums">{f.duration(data.targets.resolution[s])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-sm text-slate-600">
        <li>{t('notes.clock')}</li>
        <li>{t('notes.firstResponse')}</li>
        <li>{t('notes.window', { days: data.windowDays })}</li>
        <li>{t('notes.excluded')}</li>
        <li>{t('notes.disputed')}</li>
        <li>{t('notes.median')}</li>
      </ul>
    </section>
  );
}

export default function ScorecardsPage() {
  const t = useTranslations('scorecards');
  const query = useQuery({
    queryKey: queryKeys.scorecards,
    queryFn: ({ signal }) => api.get('/scorecards', undefined, { signal }),
  });

  const header = <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />;

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Spinner label={t('loading')} />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadError>{errorMessage(query.error, t('loadError'))}</LoadError>
      </div>
    );
  }

  const data = query.data;
  if (data.departments.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="py-10 text-center text-sm text-slate-500">{t('none')}</p>
      </div>
    );
  }

  // Worst first: this page is for seeing who is behind.
  const departments = [...data.departments].sort(
    (a, b) => b.overdueCount - a.overdueCount || a.name.localeCompare(b.name),
  );
  const behind = departments.filter((d) => d.overdueCount > 0);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        {header}
        <Statement overdue={departments.reduce((sum, d) => sum + d.overdueCount, 0)} />
      </div>
      <ComparisonTable departments={departments} />
      {behind.length > 0 && <OverdueReports departments={behind} />}
      <HowMeasured data={data} />
    </div>
  );
}

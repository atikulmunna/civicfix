'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatDuration, formatRate, SEVERITY_OPTIONS, severityLabel } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import type { DepartmentScorecard, Scorecards } from '@/lib/types';
import { SeverityBadge } from '@/components/badges';
import { LoadError, PageHeader, Spinner } from '@/components/ui';

/** A measured value, or a quiet "No data": never a zero nobody measured. */
function Measure({ children }: { children: ReactNode }) {
  return children === null ? <span className="text-slate-400">No data</span> : <>{children}</>;
}

const orNull = <T,>(value: T | null, format: (v: T) => string) =>
  value === null ? null : format(value);

/** The one sentence this page exists to say. */
function Statement({ overdue }: { overdue: number }) {
  return (
    <p className="max-w-3xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
      {overdue === 0
        ? 'No report is past its resolution target right now.'
        : `${String(overdue)} ${overdue === 1 ? 'report is' : 'reports are'} past ${
            overdue === 1 ? 'its' : 'their'
          } resolution target right now.`}
    </p>
  );
}

function ComparisonTable({ departments }: { departments: DepartmentScorecard[] }) {
  const header = 'px-3 py-2 text-left align-bottom text-sm font-medium text-slate-500';
  // No text colour here: the row sets it, and the overdue cell overrides it.
  const cell = 'px-3 py-3 align-top tabular-nums';
  return (
    <div
      className="overflow-x-auto border-t-2 border-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600"
      // Scrollable on narrow screens, so keyboard users need to reach it.
      tabIndex={0}
      role="region"
      aria-label="Scores by department"
    >
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th scope="col" className={`${header} pl-0`}>
              Department
            </th>
            <th scope="col" className={header}>
              Overdue now
            </th>
            <th scope="col" className={header}>
              Resolved
            </th>
            <th scope="col" className={header}>
              First response on time
            </th>
            <th scope="col" className={header}>
              Resolved on time
            </th>
            <th scope="col" className={header}>
              Typical first response
            </th>
            <th scope="col" className={header}>
              Typical time to resolve
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
                {d.overdueCount}
              </td>
              <td className={cell}>
                <Measure>{orNull(d.resolutionRate, formatRate)}</Measure>
                <span className="block text-xs text-slate-500">
                  {d.resolved} of {d.assigned} assigned
                </span>
              </td>
              <td className={cell}>
                <Measure>{orNull(d.respondedOnTimeRate, formatRate)}</Measure>
              </td>
              <td className={cell}>
                <Measure>{orNull(d.resolvedOnTimeRate, formatRate)}</Measure>
              </td>
              <td className={cell}>
                <Measure>{orNull(d.medianResponseHours, formatDuration)}</Measure>
              </td>
              <td className={cell}>
                <Measure>{orNull(d.medianResolveHours, formatDuration)}</Measure>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverdueReports({ departments }: { departments: DepartmentScorecard[] }) {
  return (
    <section aria-labelledby="overdue-heading" className="max-w-3xl">
      <h2 id="overdue-heading" className="text-xl font-semibold text-slate-900">
        Overdue reports
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        {departments.map((d) => (
          <div key={d.departmentId}>
            <h3 className="font-medium text-slate-900">{d.name}</h3>
            {d.overdueCount > d.overdue.length && (
              <p className="text-sm text-slate-500">
                Showing the {d.overdue.length} most overdue of {d.overdueCount}.
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
                    {formatDuration(o.hoursOverdue)} over target
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
  return (
    <section aria-labelledby="method-heading" className="max-w-2xl">
      <h2 id="method-heading" className="text-xl font-semibold text-slate-900">
        How this is measured
      </h2>
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">Targets by severity</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th scope="col" className="py-2 pr-3 font-medium">
              Severity
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              First response within
            </th>
            <th scope="col" className="py-2 font-medium">
              Resolved within
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {[...SEVERITY_OPTIONS].reverse().map((s) => (
            <tr key={s}>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-slate-900">
                {severityLabel(s)}
              </th>
              <td className="py-2 pr-3 tabular-nums">{formatDuration(data.targets.response[s])}</td>
              <td className="py-2 tabular-nums">{formatDuration(data.targets.resolution[s])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-sm text-slate-600">
        <li>
          The clock starts when a report is assigned to a department, so time waiting for review
          does not count against it. A reassigned report counts for its current department.
        </li>
        <li>First response is the department&apos;s first status change after assignment.</li>
        <li>
          Scores cover reports assigned in the last {data.windowDays} days. A report still within
          its target counts neither way. Overdue reports are counted whatever their age.
        </li>
        <li>
          Reports rejected or marked as duplicates had nothing to resolve, so they are left out of
          the resolved percentages.
        </li>
        <li>Typical means the median: half of reports were faster, half slower.</li>
      </ul>
    </section>
  );
}

export default function ScorecardsPage() {
  const query = useQuery({
    queryKey: queryKeys.scorecards,
    queryFn: ({ signal }) => api.get('/scorecards', undefined, { signal }),
  });

  const header = (
    <PageHeader
      eyebrow="Accountability"
      title="Department scorecards"
      subtitle="How quickly each department responds to and resolves the reports assigned to it."
    />
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Spinner label="Loading scorecards…" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadError>{errorMessage(query.error, 'Failed to load the scorecards.')}</LoadError>
      </div>
    );
  }

  const data = query.data;
  if (data.departments.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="py-10 text-center text-sm text-slate-500">
          Scorecards appear here once departments are set up.
        </p>
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

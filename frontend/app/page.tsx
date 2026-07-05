import Link from 'next/link';
import type { ReactNode } from 'react';

const STEPS = [
  { n: '01', title: 'Report', body: 'Describe the issue, add a photo, and drop a pin on the map.' },
  { n: '02', title: 'Verify', body: 'Neighbours confirm it and admins review and assign it to a department.' },
  { n: '03', title: 'Resolve', body: 'Track status changes and get notified when it’s fixed.' },
];

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    title: 'Pin the exact spot',
    body: 'Drop a marker on the map — every report carries precise GPS coordinates.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    ),
    title: 'Photo evidence',
    body: 'Attach a picture so the problem is unmistakable — image type is verified on the server.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Community verification',
    body: 'Neighbours upvote and confirm reports, surfacing what matters most.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
    title: 'Transparent tracking',
    body: 'Follow each report through a clear six-stage lifecycle, from submission to fix.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
      </svg>
    ),
    title: 'Routed to the right team',
    body: 'Admins assign each issue to the department responsible for resolving it.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
    title: 'Stay in the loop',
    body: 'Get notified the moment your report changes status or gets resolved.',
  },
];

const CATEGORIES = [
  'Roads & Potholes', 'Street Lighting', 'Garbage & Sanitation', 'Water & Drainage',
  'Public Safety', 'Parks & Greenery', 'Electricity',
];

const LIFECYCLE = ['Submitted', 'Under review', 'Verified', 'Assigned', 'In progress', 'Resolved'];

const RESIDENT_ITEMS = [
  'Report an issue in under a minute',
  'See what others have flagged nearby on the map',
  'Confirm and upvote to add weight to a report',
  'Track progress and get notified on every change',
];

const TEAM_ITEMS = [
  'Review and verify incoming reports',
  'Assign work to the responsible department',
  'Move issues through the status workflow',
  'Monitor trends on the analytics dashboard',
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-teal-600">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16 sm:gap-24">
      {/* Hero */}
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-16 sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          Community-powered civic reporting
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
          Report civic issues. <span className="text-teal-600">Track the fix.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Residents report local problems — potholes, broken lights, garbage, flooding — with a
          photo and map location, then follow them from submission to resolution.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/reports/new"
            className="rounded-lg bg-teal-600 px-5 py-2.5 font-medium text-white transition hover:bg-teal-700"
          >
            Report an issue
          </Link>
          <Link
            href="/map"
            className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white transition hover:bg-slate-800"
          >
            Explore the map
          </Link>
          <Link
            href="/reports"
            className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Browse reports →
          </Link>
        </div>
        <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-slate-200 pt-6">
          {[
            { k: '7', v: 'Issue categories' },
            { k: '6', v: 'Status stages' },
            { k: 'Free', v: 'No paid services' },
          ].map((f) => (
            <div key={f.v}>
              <dt className="text-3xl font-extrabold tracking-tight text-slate-900">{f.k}</dt>
              <dd className="mt-1 text-sm text-slate-500">{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* How it works */}
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">How it works</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          From report to resolution in three steps
        </h2>
        <ol className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title} className="border-t-2 border-slate-900 pt-5">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-extrabold tabular-nums text-teal-600">{s.n}</span>
                <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">What you can do</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Everything a report needs to get fixed
        </h2>
        <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-teal-400">
                {f.icon}
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories + lifecycle */}
      <section className="grid gap-12 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">What you can report</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Seven categories of civic issues
          </h2>
          <ul className="mt-6 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <li
                key={c}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">Every report, tracked</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            A transparent status lifecycle
          </h2>
          <ol className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3">
            {LIFECYCLE.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span
                  className={
                    i === LIFECYCLE.length - 1
                      ? 'rounded-full bg-teal-600 px-3 py-1 text-sm font-medium text-white'
                      : 'rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700'
                  }
                >
                  {s}
                </span>
                {i < LIFECYCLE.length - 1 && (
                  <span className="text-slate-400" aria-hidden>→</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Two audiences */}
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">Built for both sides</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          For the people who report — and the people who fix
        </h2>
        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <div className="border-t-2 border-slate-900 pt-5">
            <h3 className="text-lg font-bold text-slate-900">For residents</h3>
            <ul className="mt-4 space-y-3">
              {RESIDENT_ITEMS.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] text-slate-600">
                  <Check />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t-2 border-teal-500 pt-5">
            <h3 className="text-lg font-bold text-slate-900">For departments &amp; admins</h3>
            <ul className="mt-4 space-y-3">
              {TEAM_ITEMS.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] text-slate-600">
                  <Check />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-3xl bg-slate-900 px-6 py-14 text-center sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-400">Get started</p>
        <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Spotted something broken? Report it.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">
          It takes about a minute, and your neighbours can back you up. Every report is public and
          tracked to resolution.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/reports/new"
            className="rounded-lg bg-teal-500 px-5 py-2.5 font-medium text-slate-950 transition hover:bg-teal-400"
          >
            Report an issue
          </Link>
          <Link
            href="/map"
            className="rounded-lg border border-white/25 px-5 py-2.5 font-medium text-white transition hover:bg-white/10"
          >
            Explore the map
          </Link>
        </div>
      </section>
    </div>
  );
}

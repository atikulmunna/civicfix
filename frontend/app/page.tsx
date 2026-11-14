import Link from 'next/link';
import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

const STEPS = ['report', 'verify', 'resolve'] as const;

type FeatureId = 'pin' | 'photo' | 'community' | 'tracking' | 'routing' | 'notify';

const FEATURES: { id: FeatureId; icon: ReactNode }[] = [
  {
    id: 'pin',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-9 w-9"
      >
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    id: 'photo',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-9 w-9"
      >
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
        <circle cx="12" cy="13" r="3" />
      </svg>
    ),
  },
  {
    id: 'community',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-9 w-9"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'tracking',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-9 w-9"
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    id: 'routing',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-9 w-9"
      >
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
      </svg>
    ),
  },
  {
    id: 'notify',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-9 w-9"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
];

const CATEGORIES = [
  'roads',
  'lighting',
  'garbage',
  'water',
  'safety',
  'parks',
  'electricity',
] as const;

/** The six stages a report moves through, named by their status labels. */
const LIFECYCLE = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'VERIFIED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
] as const;

const RESIDENT_ITEMS = ['report', 'map', 'confirm', 'track'] as const;

const TEAM_ITEMS = ['review', 'assign', 'workflow', 'trends'] as const;

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-5 w-5 shrink-0 text-teal-600"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function HeroArt({ label }: { label: string }) {
  return (
    <div className="hidden justify-center lg:flex">
      <svg viewBox="0 0 400 380" className="w-full max-w-md" role="img" aria-label={label}>
        <defs>
          <radialGradient id="civic-glow" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.28" />
            <stop offset="70%" stopColor="#2dd4bf" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="200" cy="170" r="185" fill="url(#civic-glow)" />
        <circle cx="200" cy="170" r="150" fill="none" stroke="#e2e8f0" />
        <circle cx="200" cy="170" r="100" fill="none" stroke="#e2e8f0" />

        {/* animated route */}
        <path
          d="M84 108 Q170 92 200 170 T 300 244"
          fill="none"
          stroke="#5eead4"
          strokeWidth={2}
          strokeDasharray="2 8"
          strokeLinecap="round"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="40;0"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </path>

        {/* pulse rings radiating from the main pin */}
        {[0, 1, 2].map((i) => (
          <circle key={i} cx="200" cy="170" r="20" fill="none" stroke="#14b8a6" strokeWidth={2}>
            <animate
              attributeName="r"
              values="20;150"
              dur="3s"
              begin={`${i}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.5;0"
              dur="3s"
              begin={`${i}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* secondary pins */}
        <g transform="translate(60,74) scale(1.1)" opacity="0.7">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="#0f766e" />
          <circle cx="12" cy="10" r="3" fill="#ffffff" />
        </g>
        <g transform="translate(268,208) scale(1.1)" opacity="0.7">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="#0f766e" />
          <circle cx="12" cy="10" r="3" fill="#ffffff" />
        </g>

        {/* blinking report dots */}
        <circle cx="118" cy="248" r="4" fill="#14b8a6">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="300" cy="112" r="4" fill="#14b8a6">
          <animate attributeName="opacity" values="1;0.3;1" dur="2.6s" repeatCount="indefinite" />
        </circle>

        {/* main pin */}
        <g transform="translate(176,150) scale(2)">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" fill="#0d9488" />
          <circle cx="12" cy="10" r="3" fill="#ffffff" />
        </g>
      </svg>
    </div>
  );
}

export default function HomePage() {
  const t = useTranslations('home');
  const status = useTranslations('status');
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-16 sm:gap-24">
      {/* Hero */}
      <section className="rounded-3xl border border-slate-200 bg-white px-6 py-16 sm:px-12">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
              {t('hero.eyebrow')}
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
              {t('hero.titleLead')} <span className="text-teal-600">{t('hero.titleAccent')}</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-600">{t('hero.body')}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/reports/new"
                className="rounded-lg bg-teal-600 px-5 py-2.5 font-medium text-white transition hover:bg-teal-700"
              >
                {t('hero.reportIssue')}
              </Link>
              <Link
                href="/map"
                className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white transition hover:bg-slate-800"
              >
                {t('hero.exploreMap')}
              </Link>
              <Link
                href="/reports"
                className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {t('hero.browse')} →
              </Link>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-slate-200 pt-6">
              {[
                { k: format.number(CATEGORIES.length), v: t('hero.categories') },
                { k: format.number(LIFECYCLE.length), v: t('hero.stages') },
                { k: t('hero.freeValue'), v: t('hero.free') },
              ].map((f) => (
                <div key={f.v}>
                  <dt className="text-3xl font-extrabold tracking-tight text-slate-900">{f.k}</dt>
                  <dd className="mt-1 text-sm text-slate-500">{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroArt label={t('hero.artLabel')} />
        </div>
      </section>

      {/* How it works */}
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          {t('how.eyebrow')}
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('how.title')}
        </h2>
        <ol className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step} className="border-t-2 border-slate-900 pt-5">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-extrabold tabular-nums text-teal-600">
                  {format.number(i + 1, { minimumIntegerDigits: 2 })}
                </span>
                <h3 className="text-lg font-bold text-slate-900">{t(`how.steps.${step}.title`)}</h3>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                {t(`how.steps.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          {t('features.eyebrow')}
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('features.title')}
        </h2>
        <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.id} className="flex gap-4">
              <span className="shrink-0 text-teal-600 drop-shadow-[0_6px_14px_rgba(13,148,136,0.45)]">
                {f.icon}
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">
                  {t(`features.items.${f.id}.title`)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {t(`features.items.${f.id}.body`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories + lifecycle */}
      <section className="grid gap-12 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            {t('categories.eyebrow')}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t('categories.title')}
          </h2>
          <ul className="mt-6 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <li
                key={c}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700"
              >
                {t(`categories.items.${c}`)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            {t('lifecycle.eyebrow')}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t('lifecycle.title')}
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
                  {status(s)}
                </span>
                {i < LIFECYCLE.length - 1 && (
                  <span className="text-slate-400" aria-hidden>
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Two audiences */}
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          {t('audiences.eyebrow')}
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('audiences.title')}
        </h2>
        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <div className="border-t-2 border-slate-900 pt-5">
            <h3 className="text-lg font-bold text-slate-900">{t('audiences.residents.title')}</h3>
            <ul className="mt-4 space-y-3">
              {RESIDENT_ITEMS.map((item) => (
                <li key={item} className="flex gap-3 text-[15px] text-slate-600">
                  <Check />
                  {t(`audiences.residents.items.${item}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t-2 border-teal-500 pt-5">
            <h3 className="text-lg font-bold text-slate-900">{t('audiences.team.title')}</h3>
            <ul className="mt-4 space-y-3">
              {TEAM_ITEMS.map((item) => (
                <li key={item} className="flex gap-3 text-[15px] text-slate-600">
                  <Check />
                  {t(`audiences.team.items.${item}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-3xl bg-slate-900 px-6 py-14 text-center sm:px-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-400">
          {t('cta.eyebrow')}
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {t('cta.title')}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">{t('cta.body')}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/reports/new"
            className="rounded-lg bg-teal-500 px-5 py-2.5 font-medium text-slate-950 transition hover:bg-teal-400"
          >
            {t('cta.reportIssue')}
          </Link>
          <Link
            href="/map"
            className="rounded-lg border border-white/25 px-5 py-2.5 font-medium text-white transition hover:bg-white/10"
          >
            {t('cta.exploreMap')}
          </Link>
        </div>
      </section>
    </div>
  );
}

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12">
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
      </section>

      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">How it works</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          From report to resolution in three steps
        </h2>
        <ol className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-3">
          {[
            { n: '01', title: 'Report', body: 'Describe the issue, add a photo, and drop a pin on the map.' },
            { n: '02', title: 'Verify', body: 'Neighbours confirm it and admins review and assign it to a department.' },
            { n: '03', title: 'Resolve', body: 'Track status changes and get notified when it’s fixed.' },
          ].map((s) => (
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
    </div>
  );
}

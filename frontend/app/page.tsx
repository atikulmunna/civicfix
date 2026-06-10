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

      <section className="grid gap-5 sm:grid-cols-3">
        {[
          { n: '1', title: 'Report', body: 'Describe the issue, add a photo, and drop a pin on the map.' },
          { n: '2', title: 'Verify', body: 'Neighbours confirm it and admins review and assign it to a department.' },
          { n: '3', title: 'Resolve', body: 'Track status changes and get notified when it’s fixed.' },
        ].map((s) => (
          <div key={s.title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 font-semibold text-teal-400">
              {s.n}
            </div>
            <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

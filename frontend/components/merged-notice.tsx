import Link from 'next/link';

/** On a report merged into another (F4): where its updates are now. */
export function MergedNotice({ originalId }: { originalId: string }) {
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      This report was merged into another report of the same problem.{' '}
      <Link href={`/reports/${originalId}`} className="font-medium text-teal-700 hover:underline">
        See the original report
      </Link>{' '}
      for its updates.
    </p>
  );
}

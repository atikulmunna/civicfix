import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** On a report merged into another (F4): where its updates are now. */
export function MergedNotice({ originalId }: { originalId: string }) {
  const t = useTranslations('report');
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      {t.rich('merged', {
        link: (chunks) => (
          <Link
            href={`/reports/${originalId}`}
            className="font-medium text-teal-700 hover:underline"
          >
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}

import { useTranslations } from 'next-intl';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

/** Editorial page header: teal eyebrow + bold title, with optional subtitle and right-aligned actions. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className = '',
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div>
        {eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 text-sm">{actions}</div>}
    </div>
  );
}

/** Editorial stat: big numeral under a hairline rule (matches the landing page). */
export function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-t-2 border-slate-900 pt-4">
      <p className="text-3xl font-extrabold tracking-tight tabular-nums text-slate-900 sm:text-4xl">
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'dark' | 'danger';
}) {
  const styles = {
    primary: 'bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-600/40',
    dark: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-900/40',
    secondary:
      'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/25';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={fieldClass} {...props} />;
}

/**
 * A photo file input whose button and status come from the catalog: the
 * browser draws its own file control in the browser's language, not the
 * page's (F5). The real input stays in place, visually hidden but focusable,
 * so keyboards, screen readers and the field's Label work as before.
 */
export function PhotoPicker({
  id,
  files,
  multiple = false,
  'aria-describedby': describedBy,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id' | 'className'> & {
  id: string;
  /** What is chosen now; the parent owns it. */
  files: readonly File[];
}) {
  const t = useTranslations('common.photoPicker');
  const statusId = `${id}-chosen`;
  const [only] = files;
  const status =
    files.length === 0
      ? t('none')
      : files.length === 1 && only
        ? only.name
        : t('chosen', { count: files.length });
  return (
    <div className="relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <input
        id={id}
        type="file"
        multiple={multiple}
        aria-describedby={[describedBy, statusId].filter(Boolean).join(' ')}
        className="peer sr-only"
        {...props}
      />
      <label
        htmlFor={id}
        className="cursor-pointer rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600"
      >
        {multiple ? t('chooseMany') : t('chooseOne')}
      </label>
      <span id={statusId} className="min-w-0 truncate text-sm text-slate-600">
        {status}
      </span>
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={fieldClass} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={fieldClass} {...props} />;
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-2 text-sm text-red-700">{children}</p>;
}

export function Spinner({ label }: { label?: string }) {
  const t = useTranslations('common');
  return <p className="py-10 text-center text-sm text-slate-500">{label ?? t('loading')}</p>;
}

/** Full-width message shown when a page's data failed to load. */
export function LoadError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="py-10 text-center text-sm text-red-700">
      {children}
    </p>
  );
}

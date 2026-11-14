'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/components/toast';
import { ApiError } from '@/lib/api';
import { Button, Card, FieldError, Input, Label } from '@/components/ui';
import { MIN_PASSWORD_LENGTH } from '@/components/change-password-form';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const { register } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
      });
      toast(t('register.created'), 'success');
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('unexpected'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
        {t('register.eyebrow')}
      </p>
      <h1 className="mb-6 mt-2 text-3xl font-bold tracking-tight text-slate-900">
        {t('register.title')}
      </h1>
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <Label htmlFor="name">{t('fields.name')}</Label>
            <Input id="name" value={form.name} onChange={update('name')} required />
          </div>
          <div>
            <Label htmlFor="email">{t('fields.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update('email')}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">{t('fields.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={update('password')}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              {t('register.passwordHint', { min: MIN_PASSWORD_LENGTH })}
            </p>
          </div>
          <div>
            <Label htmlFor="phone">{t('fields.phone')}</Label>
            <Input id="phone" value={form.phone} onChange={update('phone')} />
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" disabled={busy}>
            {busy ? t('register.submitting') : t('register.submit')}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        {t('register.haveAccount')}{' '}
        <Link href="/login" className="font-medium text-teal-700 hover:underline">
          {t('register.signIn')}
        </Link>
      </p>
    </div>
  );
}

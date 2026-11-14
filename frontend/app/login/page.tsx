'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/components/toast';
import { ApiError } from '@/lib/api';
import { Button, Card, FieldError, Input, Label } from '@/components/ui';

function LoginForm() {
  const t = useTranslations('auth');
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const signedIn = await login(email, password);
      if (signedIn.mustChangePassword) {
        // An admin reset the password: choosing a new one comes first.
        toast(t('login.mustChange'), 'info');
        router.push('/me#change-password');
      } else {
        toast(t('login.signedIn'), 'success');
        router.push(params.get('next') || '/');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('unexpected'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
        {t('login.eyebrow')}
      </p>
      <h1 className="mb-6 mt-2 text-3xl font-bold tracking-tight text-slate-900">
        {t('login.title')}
      </h1>
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <Label htmlFor="email">{t('fields.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">{t('fields.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" disabled={busy}>
            {busy ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        {t('login.noAccount')}{' '}
        <Link href="/register" className="font-medium text-teal-700 hover:underline">
          {t('login.createOne')}
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

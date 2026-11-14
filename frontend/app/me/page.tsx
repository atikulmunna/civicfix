'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/components/toast';
import { ChangePasswordForm } from '@/components/change-password-form';
import { useFormat } from '@/lib/i18n/use-format';
import { Button, Card, FieldError, Input, Label, PageHeader } from '@/components/ui';

function ProfileForm() {
  const t = useTranslations('me');
  const f = useFormat();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(user!.name);
  const [phone, setPhone] = useState(user!.phone ?? '');
  const [phoneIsPublic, setPhoneIsPublic] = useState(user!.phoneIsPublic);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.patch('/users/me', { name, phone: phone || null, phoneIsPublic }),
    // The response is the updated user: put it in the session cache (the
    // navbar shows the name) instead of refetching /auth/me.
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(queryKeys.me, updated);
      toast(t('profile.saved'), 'success');
    },
    onError: (err) => setError(errorMessage(err, t('profile.saveFailed'))),
  });
  const busy = save.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t('profile.nameMissing'));
    save.mutate();
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('profile.title')}
        className="mb-6"
        actions={
          <Link href="/me/reports" className="font-medium text-teal-700 hover:underline">
            {t('profile.myReports')}
          </Link>
        }
      />

      <Card>
        <dl className="mb-4 grid grid-cols-3 gap-2 text-sm">
          <dt className="text-slate-500">{t('profile.email')}</dt>
          <dd className="col-span-2 text-slate-900">{user!.email}</dd>
          <dt className="text-slate-500">{t('profile.role')}</dt>
          <dd className="col-span-2 text-slate-900">{t(`roles.${user!.role}`)}</dd>
          <dt className="text-slate-500">{t('profile.trustScore')}</dt>
          <dd className="col-span-2 text-slate-900">{f.number(user!.trustScore)}</dd>
        </dl>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 border-t border-slate-200 pt-4"
          noValidate
        >
          <div>
            <Label htmlFor="name">{t('profile.name')}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="phone">{t('profile.phone')}</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={phoneIsPublic}
              onChange={(e) => setPhoneIsPublic(e.target.checked)}
            />
            {t('profile.phonePublic')}
          </label>
          <FieldError>{error}</FieldError>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? t('profile.saving') : t('profile.save')}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileForm />
    </RequireAuth>
  );
}

'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/components/toast';
import { Button, Card, FieldError, Input, Label } from '@/components/ui';

function ProfileForm() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user!.name);
  const [phone, setPhone] = useState(user!.phone ?? '');
  const [phoneIsPublic, setPhoneIsPublic] = useState(user!.phoneIsPublic);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.patch<{ user: User }>('/users/me', { name, phone: phone || null, phoneIsPublic });
      await refreshUser();
      toast('Profile updated.', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">My profile</h1>
        <Link href="/me/reports" className="text-sm font-medium text-teal-700 hover:underline">
          My reports →
        </Link>
      </div>

      <Card>
        <dl className="mb-4 grid grid-cols-3 gap-2 text-sm">
          <dt className="text-slate-500">Email</dt>
          <dd className="col-span-2 text-slate-900">{user!.email}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd className="col-span-2 capitalize text-slate-900">{user!.role.replace('_', ' ')}</dd>
          <dt className="text-slate-500">Trust score</dt>
          <dd className="col-span-2 text-slate-900">{user!.trustScore}</dd>
        </dl>

        <form onSubmit={onSubmit} className="flex flex-col gap-4 border-t border-slate-200 pt-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={phoneIsPublic}
              onChange={(e) => setPhoneIsPublic(e.target.checked)}
            />
            Show my phone number publicly
          </label>
          <FieldError>{error}</FieldError>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>
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

'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/components/toast';
import { Button, Card, FieldError, Input, Label } from '@/components/ui';

/** Matches the API's password policy minimum (backend auth/password.ts). */
const MIN_LENGTH = 8;

/**
 * Change password (R19). The API revokes every other session; this device
 * keeps going on the fresh cookies it returns.
 */
export function ChangePasswordForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', body),
    // The response is the updated user (mustChangePassword cleared), so the
    // reset banner disappears without refetching /auth/me.
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(queryKeys.me, updated);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast('Password changed. You were signed out on your other devices.', 'success');
    },
    onError: (err) => setError(errorMessage(err, 'Could not change your password.')),
  });
  const busy = change.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${String(MIN_LENGTH)} characters.`);
      return;
    }
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    change.mutate({ currentPassword: current, newPassword: next });
  }

  return (
    <Card>
      <h2 id="change-password" className="mb-1 text-lg font-semibold text-slate-900">
        Change password
      </h2>
      {user?.mustChangePassword ? (
        <p role="status" className="mb-4 text-sm text-amber-800">
          An administrator reset your password. Choose a new one to finish signing in safely.
        </p>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          You will stay signed in here and be signed out everywhere else.
        </p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <FieldError>{error}</FieldError>
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

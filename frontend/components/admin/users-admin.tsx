'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Paginated, Role } from '@/lib/types';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/components/toast';
import { Button, Input, Select, Spinner } from '@/components/ui';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  departmentId: string | null;
}

const ROLES: Role[] = ['citizen', 'department_worker', 'admin', 'super_admin'];

export function UsersAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuper = user?.role === 'super_admin';
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get<Paginated<AdminUser>>('/admin/users', { search: search || undefined, page, limit: 20 })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }
  useEffect(load, [page, search]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleActive(u: AdminUser) {
    try {
      await api.patch(`/admin/users/${u.id}/status`, { isActive: !u.isActive });
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed.', 'error');
    }
  }

  async function changeRole(u: AdminUser, role: Role) {
    try {
      await api.patch(`/admin/users/${u.id}/role`, { role });
      toast('Role updated.', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed.', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Input placeholder="Search name or email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search users" />
      {loading && !data ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Name</th><th>Email</th><th>Role</th><th>Active</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{u.name}</td>
                  <td className="text-slate-600">{u.email}</td>
                  <td>
                    {isSuper && u.id !== user?.id ? (
                      <Select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)} aria-label={`Role for ${u.email}`}>
                        {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                      </Select>
                    ) : (
                      <span className="capitalize text-slate-700">{u.role.replace('_', ' ')}</span>
                    )}
                  </td>
                  <td>{u.isActive ? <span className="text-green-700">Yes</span> : <span className="text-red-600">No</span>}</td>
                  <td className="text-right">
                    {u.id !== user?.id && (
                      <Button variant="secondary" onClick={() => toggleActive(u)}>
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalPages > 1 && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button variant="secondary" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

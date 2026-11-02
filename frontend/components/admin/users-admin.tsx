'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import type { Paginated, Role } from '@/lib/types';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/components/auth-context';
import { useToast } from '@/components/toast';
import { Button, Input, LoadError, Select, Spinner } from '@/components/ui';

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
  const queryClient = useQueryClient();
  const isSuper = user?.role === 'super_admin';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const params = { search: search || undefined, page, limit: 20 };
  const users = useQuery({
    queryKey: queryKeys.adminUsers(params),
    queryFn: ({ signal }) => api.get<Paginated<AdminUser>>('/admin/users', params, { signal }),
    placeholderData: keepPreviousData,
  });
  const data = users.data;

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const toggleActive = useMutation({
    mutationFn: (u: AdminUser) =>
      api.patch(`/admin/users/${u.id}/status`, { isActive: !u.isActive }),
    onSuccess: () => refreshUsers(),
    onError: (err) => toast(errorMessage(err, 'Failed.'), 'error'),
  });

  const changeRole = useMutation({
    mutationFn: ({ u, role }: { u: AdminUser; role: Role }) =>
      api.patch(`/admin/users/${u.id}/role`, { role }),
    onSuccess: () => {
      toast('Role updated.', 'success');
      return refreshUsers();
    },
    onError: (err) => toast(errorMessage(err, 'Failed.'), 'error'),
  });

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search name or email…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        aria-label="Search users"
      />
      {users.isPending ? (
        <Spinner />
      ) : users.isError ? (
        <LoadError>{errorMessage(users.error, 'Failed to load users.')}</LoadError>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.data.items.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-900">{u.name}</td>
                  <td className="text-slate-600">{u.email}</td>
                  <td>
                    {isSuper && u.id !== user?.id ? (
                      <Select
                        value={u.role}
                        onChange={(e) => changeRole.mutate({ u, role: e.target.value as Role })}
                        aria-label={`Role for ${u.email}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.replace('_', ' ')}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="capitalize text-slate-700">{u.role.replace('_', ' ')}</span>
                    )}
                  </td>
                  <td>
                    {u.isActive ? (
                      <span className="text-green-700">Yes</span>
                    ) : (
                      <span className="text-red-600">No</span>
                    )}
                  </td>
                  <td className="text-right">
                    {u.id !== user?.id && (
                      <Button variant="secondary" onClick={() => toggleActive.mutate(u)}>
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
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

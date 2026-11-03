'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { RequireAuth } from '@/components/require-auth';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/query-keys';
import { Button, LoadError, PageHeader, Spinner } from '@/components/ui';

interface Action {
  id: string;
  run: () => Promise<unknown>;
  done: string;
}

function Queue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: queryKeys.departmentQueue,
    queryFn: ({ signal }) => api.get('/department/reports', { limit: 50 }, { signal }),
  });
  const data = queue.data;

  const action = useMutation({
    mutationFn: (a: Action) => a.run(),
    onSuccess: async (_result, a) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.departmentQueue });
      toast(a.done, 'success');
    },
    onError: (err) => toast(errorMessage(err, 'Action failed.'), 'error'),
  });
  const busyId = action.isPending ? action.variables.id : null;
  const act = (id: string, run: () => Promise<unknown>, done: string) =>
    action.mutate({ id, run, done });

  if (queue.isPending) return <Spinner />;
  if (queue.isError) {
    return <LoadError>{errorMessage(queue.error, 'Failed to load your queue.')}</LoadError>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Department"
        title="My department queue"
        subtitle="Reports assigned to your department."
      />
      {data && data.items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.items.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status} />
                  <SeverityBadge severity={r.severity} />
                  <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
                </div>
                <Link
                  href={`/reports/${r.id}`}
                  className="mt-1 block truncate font-medium text-slate-900 hover:underline"
                >
                  {r.title}
                </Link>
              </div>
              <div className="flex gap-2">
                {r.status === 'ASSIGNED' && (
                  <Button
                    disabled={busyId === r.id}
                    onClick={() =>
                      act(
                        r.id,
                        () => api.patch(`/admin/reports/${r.id}/status`, { status: 'IN_PROGRESS' }),
                        'Work started.',
                      )
                    }
                  >
                    Start work
                  </Button>
                )}
                {r.status === 'IN_PROGRESS' && (
                  <Button
                    disabled={busyId === r.id}
                    onClick={() =>
                      act(
                        r.id,
                        () => api.post(`/admin/reports/${r.id}/resolve`, {}),
                        'Marked resolved.',
                      )
                    }
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-slate-500">
          No reports assigned to your department.
        </p>
      )}
    </div>
  );
}

export default function DepartmentPage() {
  return (
    <RequireAuth require="staff">
      <Queue />
    </RequireAuth>
  );
}

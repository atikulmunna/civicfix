'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useToast } from '@/components/toast';
import { Button, Input, LoadError, Spinner } from '@/components/ui';

interface CatalogItem {
  id: string;
  name: string;
  isActive?: boolean;
  [key: string]: unknown;
}

export interface CatalogConfig {
  listPath: string; // e.g. /categories
  adminPath: string; // e.g. /admin/categories
  responseKey: string; // e.g. categories
  itemKey: string; // e.g. category
  secondary?: { key: string; label: string };
}

/** Generic CRUD admin for categories & departments (name + optional field). */
export function CatalogAdmin({ config }: { config: CatalogConfig }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [secondary, setSecondary] = useState('');

  const items = useQuery({
    queryKey: queryKeys.catalog(config.listPath),
    queryFn: ({ signal }) =>
      api.get<Record<string, CatalogItem[] | undefined>>(
        config.listPath,
        { includeInactive: 'true' },
        { signal },
      ),
    select: (d) => d[config.responseKey] ?? [],
  });

  /** Refresh this admin list and the public list it mirrors (e.g. /categories). */
  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog(config.listPath) }),
      queryClient.invalidateQueries({ queryKey: [config.responseKey] }),
    ]);
  }

  const create = useMutation({
    mutationFn: (payload: Record<string, string>) => api.post(config.adminPath, payload),
    onSuccess: async () => {
      setName('');
      setSecondary('');
      await invalidate();
    },
    onError: (err) => toast(errorMessage(err, 'Failed to create.'), 'error'),
  });

  const setActive = useMutation({
    mutationFn: ({ item, isActive }: { item: CatalogItem; isActive: boolean }) =>
      isActive
        ? api.patch(`${config.adminPath}/${item.id}`, { isActive: true })
        : api.del(`${config.adminPath}/${item.id}`),
    onSuccess: () => invalidate(),
    onError: (err) => toast(errorMessage(err, 'Failed.'), 'error'),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: Record<string, string> = { name };
    if (config.secondary && secondary) payload[config.secondary.key] = secondary;
    create.mutate(payload);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={`New ${config.itemKey} name`}
          />
        </div>
        {config.secondary && (
          <div className="flex-1">
            <Input
              placeholder={config.secondary.label}
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              aria-label={config.secondary.label}
            />
          </div>
        )}
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          Add
        </Button>
      </form>

      {items.isPending ? (
        <Spinner />
      ) : items.isError ? (
        <LoadError>{errorMessage(items.error, 'Failed to load items.')}</LoadError>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.data.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span
                  className={`font-medium ${item.isActive === false ? 'text-slate-400 line-through' : 'text-slate-900'}`}
                >
                  {item.name}
                </span>
                {config.secondary && item[config.secondary.key] ? (
                  <span className="ml-2 text-slate-500">{String(item[config.secondary.key])}</span>
                ) : null}
              </div>
              {item.isActive === false ? (
                <Button
                  variant="secondary"
                  onClick={() => setActive.mutate({ item, isActive: true })}
                >
                  Enable
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => setActive.mutate({ item, isActive: false })}
                >
                  Disable
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

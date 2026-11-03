'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useToast } from '@/components/toast';
import { Button, Input, LoadError, Spinner } from '@/components/ui';
import type { Category, Department } from '@/lib/types';

type CatalogItem = Category | Department;

/** Which catalog to manage; the paths are typed by the API contract. */
export interface CatalogConfig {
  listPath: '/categories' | '/departments';
  adminPath: '/admin/categories' | '/admin/departments';
  responseKey: 'categories' | 'departments';
  itemKey: string; // e.g. category
  /** Optional second field: a category's icon or a department's contact email. */
  secondary?: { key: 'icon' | 'contactEmail'; label: string };
}

/** The optional second field of an item, whichever catalog it belongs to. */
function secondaryOf(item: CatalogItem): string | null {
  return 'icon' in item ? item.icon : item.contactEmail;
}

/** Generic CRUD admin for categories & departments (name + optional field). */
export function CatalogAdmin({ config }: { config: CatalogConfig }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [secondary, setSecondary] = useState('');

  const items = useQuery({
    queryKey: queryKeys.catalog(config.listPath),
    queryFn: ({ signal }) => api.get(config.listPath, { includeInactive: 'true' }, { signal }),
    select: (d): CatalogItem[] => ('categories' in d ? d.categories : d.departments),
  });

  /** Refresh this admin list and the public list it mirrors (e.g. /categories). */
  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog(config.listPath) }),
      queryClient.invalidateQueries({ queryKey: [config.responseKey] }),
    ]);
  }

  const create = useMutation({
    mutationFn: (payload: { name: string; icon?: string; contactEmail?: string }) =>
      api.post(config.adminPath, payload),
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
    const extra = config.secondary && secondary ? { [config.secondary.key]: secondary } : {};
    create.mutate({ name, ...extra });
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
                {config.secondary && secondaryOf(item) ? (
                  <span className="ml-2 text-slate-500">{secondaryOf(item)}</span>
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

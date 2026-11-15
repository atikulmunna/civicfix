'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useToast } from '@/components/toast';
import { Button, Input, LoadError, Spinner } from '@/components/ui';
import type { Category, Department } from '@/lib/types';
import { useErrorMessage } from '@/lib/i18n/use-error-message';

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

/**
 * The Bangla name of one item (F5), shown to Bangla readers instead of the
 * English name. Leaving it empty clears it, and readers see the English name.
 */
function BanglaNameEditor({
  item,
  adminPath,
  onSaved,
}: {
  item: CatalogItem;
  adminPath: CatalogConfig['adminPath'];
  onSaved: () => Promise<unknown>;
}) {
  const errorText = useErrorMessage();
  const { toast } = useToast();
  const saved = item.nameBn ?? '';
  const [value, setValue] = useState(saved);
  const save = useMutation({
    mutationFn: () => api.patch(`${adminPath}/${item.id}`, { nameBn: value }),
    onSuccess: async () => {
      await onSaved();
      toast('Bangla name saved.', 'success');
    },
    onError: (err) => toast(errorText(err, 'Could not save the Bangla name.'), 'error'),
  });
  return (
    <div className="mt-1 flex items-center gap-2">
      <Input
        placeholder="Name in Bangla"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Name in Bangla for ${item.name}`}
        lang="bn"
      />
      <Button
        variant="secondary"
        disabled={save.isPending || value.trim() === saved}
        onClick={() => save.mutate()}
        aria-label={`Save Bangla name for ${item.name}`}
      >
        Save
      </Button>
    </div>
  );
}

/** Generic CRUD admin for categories & departments (name + optional field). */
export function CatalogAdmin({ config }: { config: CatalogConfig }) {
  const errorText = useErrorMessage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
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
    mutationFn: (payload: {
      name: string;
      nameBn?: string;
      icon?: string;
      contactEmail?: string;
    }) => api.post(config.adminPath, payload),
    onSuccess: async () => {
      setName('');
      setNameBn('');
      setSecondary('');
      await invalidate();
    },
    onError: (err) => toast(errorText(err, 'Failed to create.'), 'error'),
  });

  const setActive = useMutation({
    mutationFn: ({ item, isActive }: { item: CatalogItem; isActive: boolean }) =>
      isActive
        ? api.patch(`${config.adminPath}/${item.id}`, { isActive: true })
        : api.del(`${config.adminPath}/${item.id}`),
    onSuccess: () => invalidate(),
    onError: (err) => toast(errorText(err, 'Failed.'), 'error'),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const extra = config.secondary && secondary ? { [config.secondary.key]: secondary } : {};
    create.mutate({ name, ...(nameBn.trim() ? { nameBn } : {}), ...extra });
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
        <div className="flex-1">
          <Input
            placeholder="Name in Bangla (optional)"
            value={nameBn}
            onChange={(e) => setNameBn(e.target.value)}
            aria-label={`New ${config.itemKey} name in Bangla`}
            lang="bn"
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
        <LoadError>{errorText(items.error, 'Failed to load items.')}</LoadError>
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
                <BanglaNameEditor item={item} adminPath={config.adminPath} onSaved={invalidate} />
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

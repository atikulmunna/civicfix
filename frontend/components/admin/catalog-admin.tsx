'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/toast';
import { Button, Input, Spinner } from '@/components/ui';

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
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [secondary, setSecondary] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    api.get<Record<string, CatalogItem[]>>(config.listPath, { includeInactive: 'true' })
      .then((d) => setItems(d[config.responseKey] ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const payload: Record<string, string> = { name };
      if (config.secondary && secondary) payload[config.secondary.key] = secondary;
      await api.post(config.adminPath, payload);
      setName('');
      setSecondary('');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to create.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function setActive(item: CatalogItem, isActive: boolean) {
    try {
      if (isActive) await api.patch(`${config.adminPath}/${item.id}`, { isActive: true });
      else await api.del(`${config.adminPath}/${item.id}`);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed.', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label={`New ${config.itemKey} name`} />
        </div>
        {config.secondary && (
          <div className="flex-1">
            <Input placeholder={config.secondary.label} value={secondary} onChange={(e) => setSecondary(e.target.value)} aria-label={config.secondary.label} />
          </div>
        )}
        <Button type="submit" disabled={busy || !name.trim()}>Add</Button>
      </form>

      {loading ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className={`font-medium ${item.isActive === false ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{item.name}</span>
                {config.secondary && item[config.secondary.key] ? (
                  <span className="ml-2 text-slate-500">{String(item[config.secondary.key])}</span>
                ) : null}
              </div>
              {item.isActive === false ? (
                <Button variant="secondary" onClick={() => setActive(item, true)}>Enable</Button>
              ) : (
                <Button variant="secondary" onClick={() => setActive(item, false)}>Disable</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

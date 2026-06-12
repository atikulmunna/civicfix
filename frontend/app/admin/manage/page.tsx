'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { Card } from '@/components/ui';
import { UsersAdmin } from '@/components/admin/users-admin';
import { CatalogAdmin } from '@/components/admin/catalog-admin';

const TABS = ['Users', 'Categories', 'Departments'] as const;
type Tab = (typeof TABS)[number];

function Manage() {
  const [tab, setTab] = useState<Tab>('Users');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">Manage</h1>

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card>
        {tab === 'Users' && <UsersAdmin />}
        {tab === 'Categories' && (
          <CatalogAdmin
            config={{ listPath: '/categories', adminPath: '/admin/categories', responseKey: 'categories', itemKey: 'category', secondary: { key: 'icon', label: 'Icon (optional)' } }}
          />
        )}
        {tab === 'Departments' && (
          <CatalogAdmin
            config={{ listPath: '/departments', adminPath: '/admin/departments', responseKey: 'departments', itemKey: 'department', secondary: { key: 'contactEmail', label: 'Contact email (optional)' } }}
          />
        )}
      </Card>
    </div>
  );
}

export default function ManagePage() {
  return (
    <RequireAuth require="admin">
      <Manage />
    </RequireAuth>
  );
}

'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui';

// Leaflet touches `window`, so load the map client-side only.
const ReportsMap = dynamic(() => import('@/components/reports-map').then((m) => m.ReportsMap), {
  ssr: false,
  loading: () => <Spinner label="Loading map…" />,
});

export default function MapPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-slate-900">Map</h1>
      <div className="h-[calc(100vh-12rem)]">
        <ReportsMap />
      </div>
    </div>
  );
}

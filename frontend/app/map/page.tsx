'use client';

import dynamic from 'next/dynamic';
import { PageHeader, Spinner } from '@/components/ui';

// Leaflet touches `window`, so load the map client-side only.
const ReportsMap = dynamic(() => import('@/components/reports-map').then((m) => m.ReportsMap), {
  ssr: false,
  loading: () => <Spinner label="Loading map…" />,
});

export default function MapPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Live map" title="Map" subtitle="Every reported issue, plotted by location." />
      <div className="h-[calc(100vh-16rem)]">
        <ReportsMap />
      </div>
    </div>
  );
}

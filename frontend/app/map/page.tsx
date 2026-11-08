'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { HotspotList } from '@/components/hotspot-list';
import type { MapFocus } from '@/components/reports-map';
import { PageHeader, Spinner } from '@/components/ui';

// Leaflet touches `window`, so load the map client-side only.
const ReportsMap = dynamic(() => import('@/components/reports-map').then((m) => m.ReportsMap), {
  ssr: false,
  loading: () => <Spinner label="Loading map…" />,
});

export default function MapPage() {
  const [showHotspots, setShowHotspots] = useState(true);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <PageHeader
          eyebrow="Live map"
          title="Map"
          subtitle="Every reported issue, plotted by location. Shaded areas are hotspots, where reports cluster."
        />
        <div id="map" className="h-[calc(100vh-16rem)] scroll-mt-32 sm:scroll-mt-20">
          <ReportsMap
            showHotspots={showHotspots}
            onShowHotspotsChange={setShowHotspots}
            focus={focus}
          />
        </div>
      </div>
      <HotspotList
        onShow={(h) => {
          setShowHotspots(true);
          setFocus((f) => ({
            latitude: h.latitude,
            longitude: h.longitude,
            seq: (f?.seq ?? 0) + 1,
          }));
          document.getElementById('map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
    </div>
  );
}

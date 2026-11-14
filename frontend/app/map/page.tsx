'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { HotspotList } from '@/components/hotspot-list';
import type { MapFocus } from '@/components/reports-map';
import { useTranslations } from 'next-intl';
import { PageHeader, Spinner } from '@/components/ui';

// Leaflet touches `window`, so load the map client-side only.
const ReportsMap = dynamic(() => import('@/components/reports-map').then((m) => m.ReportsMap), {
  ssr: false,
  loading: () => <Spinner />,
});

export default function MapPage() {
  const t = useTranslations('map');
  const [showHotspots, setShowHotspots] = useState(true);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
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

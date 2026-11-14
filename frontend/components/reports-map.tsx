'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { api, errorMessage } from '@/lib/api';
import { asStatus, STATUS_OPTIONS } from '@/lib/format';
import { useFormat } from '@/lib/i18n/use-format';
import { useHotspotText } from '@/lib/hotspots';
import { useTranslations } from 'next-intl';
import { bboxString, statusColor } from '@/lib/map';
import type { Hotspot } from '@/lib/types';
import { StatusBadge } from './badges';
import { queryKeys } from '@/lib/query-keys';
import { Select } from './ui';

const DHAKA: [number, number] = [23.78, 90.4];

/** Reports the current map bounds up whenever the user pans/zooms. */
function BoundsWatcher({ onChange }: { onChange: (bbox: string) => void }) {
  const emit = useCallback(
    (map: ReturnType<typeof useMapEvents>) => {
      const b = map.getBounds();
      onChange(
        bboxString({
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        }),
      );
    },
    [onChange],
  );
  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });
  // Report the initial bounds once the map exists: syncing state from an
  // external system (Leaflet) is what an effect is for.
  useEffect(() => {
    emit(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on mount
  }, []);
  return null;
}

/** A place to move the map to; `seq` changes so the same place can be asked for twice. */
export interface MapFocus {
  latitude: number;
  longitude: number;
  seq: number;
}

/** Flies the map to the focus whenever a new one is asked for. */
function FlyTo({ focus }: { focus: MapFocus | null }) {
  const map = useMap();
  // Moving Leaflet (an external system) to match React state: an effect's job.
  useEffect(() => {
    if (focus) map.flyTo([focus.latitude, focus.longitude], 16);
  }, [focus, map]);
  return null;
}

/** Shaded so the markers on top stay readable; red where a fixed problem came back. */
function HotspotArea({ hotspot }: { hotspot: Hotspot }) {
  const t = useTranslations('map');
  const text = useHotspotText();
  const colour = hotspot.recurring ? '#dc2626' : '#d97706'; // red-600, amber-600
  return (
    <Circle
      center={[hotspot.latitude, hotspot.longitude]}
      // Padded so the circle covers its outermost reports.
      radius={Math.max(hotspot.radiusM, 40) + 30}
      pathOptions={{ color: colour, weight: 1.5, fillColor: colour, fillOpacity: 0.18 }}
    >
      <Popup>
        <div className="flex flex-col gap-1">
          <span className="font-medium text-slate-900">{text.kinds(hotspot)}</span>
          <span className="text-sm text-slate-600">{text.counts(hotspot)}</span>
          {hotspot.recurring && <span className="text-sm text-red-700">{t('cameBack')}</span>}
        </div>
      </Popup>
    </Circle>
  );
}

export function ReportsMap({
  showHotspots,
  onShowHotspotsChange,
  focus,
}: {
  showHotspots: boolean;
  onShowHotspotsChange: (show: boolean) => void;
  focus: MapFocus | null;
}) {
  const t = useTranslations('map');
  const f = useFormat();
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  // Set by BoundsWatcher on mount and on every pan/zoom.
  const [bbox, setBbox] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => api.get('/categories', undefined, { signal }),
    select: (d) => d.categories,
  });
  const categories = categoriesQuery.data ?? [];

  const params = {
    bbox,
    status: asStatus(status),
    categoryId: categoryId || undefined,
    limit: 1000,
  };
  const markersQuery = useQuery({
    queryKey: queryKeys.mapMarkers(params),
    // skipToken: nothing to ask for until the map knows its bounds.
    queryFn: bbox
      ? ({ signal }) => api.get('/reports/map', { ...params, bbox }, { signal })
      : skipToken,
    // Keep the current markers on screen while a pan loads the next set.
    placeholderData: keepPreviousData,
  });
  const markers = markersQuery.data?.items ?? [];

  // Shared with the hotspot list below the map (same key, one request).
  const hotspotsQuery = useQuery({
    queryKey: queryKeys.hotspots,
    queryFn: showHotspots ? ({ signal }) => api.get('/hotspots', undefined, { signal }) : skipToken,
  });
  const hotspots = showHotspots ? (hotspotsQuery.data?.hotspots ?? []) : [];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t('status')}
          >
            <option value="">{t('allStatuses')}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {f.status(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label={t('category')}
          >
            <option value="">
              {categoriesQuery.isError ? t('categoriesUnavailable') : t('allCategories')}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 self-center text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showHotspots}
            onChange={(e) => onShowHotspotsChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
          />
          {t('hotspotsToggle')}
        </label>
        {showHotspots && hotspotsQuery.isError && (
          <span role="alert" className="self-center text-sm text-red-700">
            {errorMessage(hotspotsQuery.error, t('hotspotsError'))}
          </span>
        )}
        <span className="ml-auto self-center text-sm text-slate-500" aria-live="polite">
          {markersQuery.isError ? (
            <span role="alert" className="text-red-700">
              {errorMessage(markersQuery.error, t('markersError'))}
            </span>
          ) : markersQuery.isPending ? (
            t('loadingReports')
          ) : (
            t('inView', { count: markers.length })
          )}
        </span>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-slate-200">
        <MapContainer center={DHAKA} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <BoundsWatcher onChange={setBbox} />
          <FlyTo focus={focus} />
          {/* Before the markers, so they are drawn on top. */}
          {hotspots.map((h) => (
            <HotspotArea key={`${String(h.latitude)},${String(h.longitude)}`} hotspot={h} />
          ))}
          {markers.map((m) => (
            <CircleMarker
              key={m.id}
              center={[m.latitude, m.longitude]}
              radius={8}
              pathOptions={{
                color: statusColor(m.status),
                fillColor: statusColor(m.status),
                fillOpacity: 0.7,
              }}
            >
              <Popup>
                <div className="flex flex-col gap-1">
                  <StatusBadge status={m.status} />
                  <span className="font-medium text-slate-900">{m.title}</span>
                  <Link href={`/reports/${m.id}`} className="text-sm text-teal-700 hover:underline">
                    {t('viewReport')} →
                  </Link>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

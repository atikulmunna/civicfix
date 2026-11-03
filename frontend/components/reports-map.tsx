'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { api, errorMessage } from '@/lib/api';
import { asStatus, STATUS_OPTIONS, statusLabel } from '@/lib/format';
import { bboxString, statusColor } from '@/lib/map';
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

export function ReportsMap() {
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

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
          >
            <option value="">
              {categoriesQuery.isError ? 'Categories unavailable' : 'All categories'}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <span className="ml-auto self-center text-sm text-slate-500" aria-live="polite">
          {markersQuery.isError ? (
            <span role="alert" className="text-red-700">
              {errorMessage(markersQuery.error, 'Could not load reports for this area.')}
            </span>
          ) : markersQuery.isPending ? (
            'Loading reports…'
          ) : (
            `${String(markers.length)} in view`
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
                    View report →
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

'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { api } from '@/lib/api';
import type { MapMarker } from '@/lib/types';
import { STATUS_OPTIONS, statusLabel } from '@/lib/format';
import { bboxString, statusColor } from '@/lib/map';
import { StatusBadge } from './badges';
import type { Category } from '@/lib/types';
import { Select } from './ui';

const DHAKA: [number, number] = [23.78, 90.4];

/** Reports the current map bounds up whenever the user pans/zooms. */
function BoundsWatcher({ onChange }: { onChange: (bbox: string) => void }) {
  const emit = useCallback(
    (map: ReturnType<typeof useMapEvents>) => {
      const b = map.getBounds();
      onChange(bboxString({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }));
    },
    [onChange],
  );
  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });
  useEffect(() => {
    emit(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function ReportsMap() {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const bboxRef = useRef('');

  useEffect(() => {
    api.get<{ categories: Category[] }>('/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  const load = useCallback(
    (bbox: string) => {
      bboxRef.current = bbox;
      api
        .get<{ items: MapMarker[] }>('/reports/map', {
          bbox,
          status: status || undefined,
          categoryId: categoryId || undefined,
          limit: 1000,
        })
        .then((d) => setMarkers(d.items))
        .catch(() => setMarkers([]));
    },
    [status, categoryId],
  );

  // Refetch when filters change (reuse the last known bbox).
  useEffect(() => {
    if (bboxRef.current) load(bboxRef.current);
  }, [load]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <span className="ml-auto self-center text-sm text-slate-500">{markers.length} in view</span>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-slate-200">
        <MapContainer center={DHAKA} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <BoundsWatcher onChange={load} />
          {markers.map((m) => (
            <CircleMarker
              key={m.id}
              center={[m.latitude, m.longitude]}
              radius={8}
              pathOptions={{ color: statusColor(m.status), fillColor: statusColor(m.status), fillOpacity: 0.7 }}
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

'use client';

import 'leaflet/dist/leaflet.css';
import { useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import { Button } from './ui';

export interface LatLng {
  lat: number;
  lng: number;
}

const DHAKA: [number, number] = [23.78, 90.4];

function ClickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
}) {
  const mapRef = useRef<LeafletMap | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      onChange(p);
      mapRef.current?.setView([p.lat, p.lng], 16);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {value ? `Selected: ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Click the map to set the location.'}
        </p>
        <Button type="button" variant="secondary" onClick={useMyLocation}>
          Use my location
        </Button>
      </div>
      <div className="h-72 overflow-hidden rounded-md border border-slate-200">
        <MapContainer ref={mapRef} center={DHAKA} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onChange} />
          {value && (
            <CircleMarker
              center={[value.lat, value.lng]}
              radius={9}
              pathOptions={{ color: '#0d9488', fillColor: '#0d9488', fillOpacity: 0.7 }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}

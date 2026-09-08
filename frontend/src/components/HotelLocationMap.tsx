'use client';

import { useEffect, useRef } from 'react';

const DEFAULT_LOCATION: [number, number] = [10.2381, 77.4892];

export function HotelLocationMap({ latitude, longitude, onChange, onReverseGeocode }: { latitude?: string | null; longitude?: string | null; onChange: (latitude: string, longitude: string) => void; onReverseGeocode?: (details: { address?: string; city?: string; state?: string; country?: string; pincode?: string }) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onReverseGeocodeRef = useRef(onReverseGeocode);
  onReverseGeocodeRef.current = onReverseGeocode;
  const lat = Number(latitude);
  const lng = Number(longitude);
  const center: [number, number] = Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : DEFAULT_LOCATION;

  async function reverseGeocode(latitude: number, longitude: number) {
    if (!onReverseGeocodeRef.current) return;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
      if (!response.ok) return;
      const result = await response.json() as { display_name?: string; address?: Record<string, string> };
      const address = result.address ?? {};
      onReverseGeocodeRef.current({
        address: result.display_name,
        city: address.city ?? address.town ?? address.village ?? address.municipality,
        state: address.state,
        country: address.country,
        pincode: address.postcode,
      });
    } catch {
      // The map remains usable if the optional free reverse-geocoder is unavailable.
    }
  }

  useEffect(() => {
    let disposed = false;
    import('leaflet').then((L) => {
      if (disposed || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(center, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
      const marker = L.marker(center, { draggable: true, icon: L.divIcon({ className: 'rainwoodMapMarker', html: '<span></span>', iconSize: [24, 32], iconAnchor: [12, 30] }) }).addTo(map);
      marker.on('dragend', () => { const position = marker.getLatLng(); onChangeRef.current(position.lat.toFixed(6), position.lng.toFixed(6)); void reverseGeocode(position.lat, position.lng); });
      map.on('click', (event: any) => { marker.setLatLng(event.latlng); onChangeRef.current(event.latlng.lat.toFixed(6), event.latlng.lng.toFixed(6)); void reverseGeocode(event.latlng.lat, event.latlng.lng); });
      mapRef.current = map; markerRef.current = marker;
      setTimeout(() => map.invalidateSize(), 0);
    });
    return () => { disposed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const next: [number, number] = [lat, lng];
    markerRef.current.setLatLng(next);
    mapRef.current.setView(next);
  }, [latitude, longitude, lat, lng]);

  return <div className="hotelLeafletMap" ref={containerRef} aria-label="Hotel location map" />;
}

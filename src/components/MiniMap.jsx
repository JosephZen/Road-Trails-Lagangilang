import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';

/**
 * Floating mini-map overlay that shows the active panorama location
 * when the panorama viewer is in full view.
 */
export default function MiniMap({ lat, lng, heading, panoramas }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [lng || 120.9842, lat || 14.5995],
      zoom: 16,
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update marker position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lat || !lng) return;

    map.setCenter([lng, lat]);

    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'map-marker active';
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
    }
  }, [lat, lng]);

  return (
    <div className="mini-map-container glass-panel">
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 'var(--radius-lg)' }} />
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';

/**
 * Floating mini-map overlay that shows the active panorama location
 * when the panorama viewer is in full view.
 */
export default function MiniMap({ theme = 'dark', lat, lng, heading, panoramas, onSelectPano }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const markersRef = useRef([]);
  const coneLayerAdded = useRef(false);

  // Re-use style logic from MapView
  const getStyleObj = (t) => {
    switch (t) {
      case 'light': return 'https://tiles.openfreemap.org/styles/liberty';
      case 'beige': return 'https://tiles.openfreemap.org/styles/positron';
      case 'satellite': return {
        version: 8,
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: 'Tiles &copy; Esri'
          }
        },
        layers: [{ id: 'satellite', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 19 }]
      };
      case 'dark':
      default: return 'https://tiles.openfreemap.org/styles/dark';
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getStyleObj(theme),
      center: [lng || 120.9842, lat || 14.5995],
      zoom: 16,
      interactive: true,
      attributionControl: false,
    });

    map.on('load', () => {
      map.addSource('view-cone-mini', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'view-cone-mini-layer',
        type: 'fill',
        source: 'view-cone-mini',
        paint: { 'fill-color': '#4cc9f0', 'fill-opacity': 0.3 },
      });
      coneLayerAdded.current = true;
      window.dispatchEvent(new Event('minimap-loaded'));
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update theme dynamically
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(getStyleObj(theme));
    mapRef.current.once('style.load', () => {
      coneLayerAdded.current = false;
      if (!mapRef.current.getSource('view-cone-mini')) {
        mapRef.current.addSource('view-cone-mini', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        mapRef.current.addLayer({
          id: 'view-cone-mini-layer',
          type: 'fill',
          source: 'view-cone-mini',
          paint: { 'fill-color': '#4cc9f0', 'fill-opacity': 0.3 },
        });
      }
      coneLayerAdded.current = true;
      window.dispatchEvent(new Event('minimap-loaded'));
    });
  }, [theme]);

  // Update center and main marker
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

  // Add neighbor markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !panoramas) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    panoramas.forEach(pano => {
      if (pano.lat === lat && pano.lng === lng) return; // Skip main marker
      const el = document.createElement('div');
      el.className = 'map-marker';
      el.style.transform = 'scale(0.7)'; // Make neighbors smaller
      el.style.cursor = 'pointer';
      
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectPano?.(pano);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pano.lng, pano.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [panoramas, lat, lng, onSelectPano]);

  // Update view cone
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lat || !lng || heading === undefined) return;

    const updateCone = () => {
      if (!coneLayerAdded.current || !mapRef.current) return;
      const fov = 45;
      const distance = 0.001; // Mini map view distance
      const points = [];
      points.push([lng, lat]);

      const startAngle = heading - fov / 2;
      const endAngle = heading + fov / 2;
      const steps = 12;

      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (endAngle - startAngle) * (i / steps);
        const rad = (angle * Math.PI) / 180;
        const dx = Math.sin(rad) * distance;
        const dy = Math.cos(rad) * distance;
        points.push([lng + dx, lat + dy]);
      }
      points.push([lng, lat]);

      const source = map.getSource('view-cone-mini');
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [points] },
          }],
        });
      }
    };

    updateCone();
    window.addEventListener('minimap-loaded', updateCone);
    return () => window.removeEventListener('minimap-loaded', updateCone);
  }, [lat, lng, heading]);

  return (
    <div className="mini-map-container glass-panel">
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 'var(--radius-lg)' }} />
    </div>
  );
}

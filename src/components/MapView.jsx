import React, { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { calculateBearing } from '../utils/geoUtils';

setWorkerUrl(maplibreWorkerUrl);

/**
 * MapView component using MapLibre GL JS with OpenFreeMap tiles.
 * Displays panorama location markers, coverage lines, and handles click-to-view.
 */
export default function MapView({
  panoramas,
  activePanoId,
  onSelectPano,
  onMapClick,
  viewerHeading,
  mapCenter,
  mapZoom,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const coneLayerAdded = useRef(false);

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: mapCenter || [120.9842, 14.5995], // Default: Manila
      zoom: mapZoom || 15,
      pitch: 0,
      antialias: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // Mapillary Vector Tiles Source
      map.addSource('mapillary', {
        type: 'vector',
        tiles: [
          'https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9'
        ],
        minzoom: 6,
        maxzoom: 14
      });

      // Mapillary Sequence Lines (Green)
      map.addLayer({
        id: 'mapillary-sequences',
        type: 'line',
        source: 'mapillary',
        'source-layer': 'sequence',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-opacity': 0.6,
          'line-color': '#05CB63',
          'line-width': 2
        }
      });

      // Mapillary Image Points (Green Dots)
      map.addLayer({
        id: 'mapillary-images',
        type: 'circle',
        source: 'mapillary',
        'source-layer': 'image',
        paint: {
          'circle-radius': 3,
          'circle-color': '#05CB63',
          'circle-opacity': 0.8
        },
        minzoom: 14
      });

      // Add source for coverage lines
      map.addSource('coverage-lines', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'coverage-lines-layer',
        type: 'line',
        source: 'coverage-lines',
        paint: {
          'line-color': '#4361ee',
          'line-width': 3,
          'line-opacity': 0.5,
        },
      });

      // Add source for direction cone (viewing direction indicator)
      map.addSource('view-cone', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'view-cone-layer',
        type: 'fill',
        source: 'view-cone',
        paint: {
          'fill-color': '#4cc9f0',
          'fill-opacity': 0.2,
        },
      });

      coneLayerAdded.current = true;
    });

    // Handle clicks on Mapillary features or the map in general
    map.on('click', (e) => {
      // Check if we clicked on a Mapillary image point first
      const imageFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['mapillary-images']
      });

      if (imageFeatures.length > 0) {
        const feature = imageFeatures[0];
        const imageId = feature.properties?.id || feature.properties?.image_id;
        if (imageId) {
          onMapClick?.(e.lngLat.lat, e.lngLat.lng, String(imageId));
          return;
        }
      }

      // Check sequence lines (they have sequence_id but not individual image_id)
      const seqFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['mapillary-sequences']
      });

      if (seqFeatures.length > 0) {
        // For sequences, we do a lat/lng search to find the nearest image
        onMapClick?.(e.lngLat.lat, e.lngLat.lng, null);
        return;
      }

      // Normal map click (no Mapillary feature)
      onMapClick?.(e.lngLat.lat, e.lngLat.lng, null);
    });

    // Change cursor when hovering over Mapillary layers
    map.on('mouseenter', 'mapillary-images', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'mapillary-images', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('mouseenter', 'mapillary-sequences', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'mapillary-sequences', () => {
      map.getCanvas().style.cursor = '';
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when panoramas change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!panoramas || panoramas.length === 0) return;

    // Add markers for each panorama
    panoramas.forEach((pano) => {
      const el = document.createElement('div');
      el.className = 'map-marker';
      if (pano.id === activePanoId) {
        el.classList.add('active');
      }
      el.dataset.panoId = pano.id;

      el.addEventListener('click', () => {
        onSelectPano?.(pano);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pano.lng, pano.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Build coverage lines between neighbors
    const features = [];
    const drawnPairs = new Set();

    panoramas.forEach((pano) => {
      if (!pano.neighbors) return;
      pano.neighbors.forEach((neighborId) => {
        const pairKey = [pano.id, neighborId].sort().join('-');
        if (drawnPairs.has(pairKey)) return;
        drawnPairs.add(pairKey);

        const neighbor = panoramas.find((p) => p.id === neighborId);
        if (!neighbor) return;

        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [pano.lng, pano.lat],
              [neighbor.lng, neighbor.lat],
            ],
          },
        });
      });
    });

    const source = map.getSource('coverage-lines');
    if (source) {
      source.setData({ type: 'FeatureCollection', features });
    }
  }, [panoramas, activePanoId, onSelectPano]);

  // Update active marker and fly to it
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activePanoId) return;

    // Update marker styles
    markersRef.current.forEach((marker) => {
      const el = marker.getElement();
      if (el.dataset.panoId === activePanoId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Fly to active panorama
    const activePano = panoramas?.find((p) => p.id === activePanoId);
    if (activePano) {
      map.flyTo({
        center: [activePano.lng, activePano.lat],
        zoom: Math.max(map.getZoom(), 17),
        duration: 800,
      });
    }
  }, [activePanoId, panoramas]);

  // Update viewing direction cone
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activePanoId || viewerHeading === undefined || !coneLayerAdded.current) return;

    const activePano = panoramas?.find((p) => p.id === activePanoId);
    if (!activePano) return;

    // Generate a cone polygon representing the viewing direction
    const cone = generateViewCone(activePano.lat, activePano.lng, viewerHeading, 30, 0.0003);
    const source = map.getSource('view-cone');
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [cone],
            },
          },
        ],
      });
    }
  }, [viewerHeading, activePanoId, panoramas]);

  return (
    <div className="map-container" ref={mapContainerRef} />
  );
}

/**
 * Generate a cone polygon for the view direction indicator.
 */
function generateViewCone(lat, lng, heading, fov = 60, distance = 0.0005) {
  const points = [];
  points.push([lng, lat]); // Center point

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

  points.push([lng, lat]); // Close the polygon
  return points;
}

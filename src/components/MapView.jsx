import React, { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { calculateBearing } from '../utils/geoUtils';

setWorkerUrl(maplibreWorkerUrl);

// Coverage Gaps & Road/Trail Corridors in Lagangilang, Abra (Research Objective 1)
const LAGANGILANG_TRAIL_CORRIDORS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Surveyed Road Corridor (Poblacion - ASIST - Town Plaza)',
        status: 'surveyed',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [120.738083, 17.60825],
          [120.738111, 17.608167],
          [120.735, 17.6158],
          [120.734, 17.6142],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Unsurveyed Mountain Trail Gap: Mount Mag-atong Eco-Trail',
        status: 'gap',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [120.734, 17.6142],
          [120.742, 17.625],
          [120.751, 17.632],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Unsurveyed River Corridor Gap: Bawa Rapids to Abra Riverbank',
        status: 'gap',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [120.742, 17.625],
          [120.728, 17.621],
          [120.725, 17.6015],
        ],
      },
    },
  ],
};

/**
 * MapView component using MapLibre GL JS with OpenFreeMap tiles.
 * Displays panorama location markers, coverage lines, POI markers, and handles click-to-view.
 */
export default function MapView({
  theme = 'dark',
  panoramas,
  activePanoId,
  onSelectPano,
  onMapClick,
  viewerHeading,
  mapCenter,
  mapZoom,
  touristSpots = [],
  activeTouristSpotId = null,
  onSelectTouristSpot,
  showCoverageGaps = true,
  routeGeoJSON,
  routeOrigin,
  routeDestination,
  showCustomOSM = true,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const poiMarkersRef = useRef([]);
  const coneLayerAdded = useRef(false);

  // Get style URL based on theme
  const getStyleObj = useCallback((t) => {
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
        layers: [
          {
            id: 'satellite',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      };
      case 'dark':
      default:
        return 'https://tiles.openfreemap.org/styles/dark';
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getStyleObj(theme),
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

      // Route line source & layer
      map.addSource('route-line', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#1e3a5f',
          'line-width': 10,
          'line-opacity': 0.4,
        },
      });

      map.addLayer({
        id: 'route-line-layer',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 5,
          'line-opacity': 0.85,
        },
      });

      // Add Trail Corridors & Coverage Gaps Source (Research Objective 1)
      map.addSource('trail-corridors', {
        type: 'geojson',
        data: LAGANGILANG_TRAIL_CORRIDORS,
      });

      // Surveyed road corridors (Solid Emerald)
      map.addLayer({
        id: 'trail-surveyed-layer',
        type: 'line',
        source: 'trail-corridors',
        filter: ['==', ['get', 'status'], 'surveyed'],
        paint: {
          'line-color': '#06d6a0',
          'line-width': 3.5,
          'line-opacity': 0.8,
        },
      });

      // Unsurveyed mountain & river trail gaps (Dashed Amber)
      map.addLayer({
        id: 'trail-gaps-layer',
        type: 'line',
        source: 'trail-corridors',
        filter: ['==', ['get', 'status'], 'gap'],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 3,
          'line-dasharray': [2, 2],
          'line-opacity': 0.9,
        },
      });

      coneLayerAdded.current = true;

      // Custom OSM Overlay (user's edited map.osm data)
      fetch('/data/lagangilang-custom.geojson')
        .then(r => r.json())
        .then(geojson => {
          if (!mapRef.current) return;
          
          mapRef.current.addSource('custom-osm', {
            type: 'geojson',
            data: geojson,
          });

          // Custom roads by type
          mapRef.current.addLayer({
            id: 'custom-roads-primary',
            type: 'line',
            source: 'custom-osm',
            filter: ['in', ['get', 'highway'], ['literal', ['primary', 'secondary', 'tertiary']]],
            paint: {
              'line-color': '#f59e0b',
              'line-width': 3,
              'line-opacity': 0.8,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });

          mapRef.current.addLayer({
            id: 'custom-roads-residential',
            type: 'line',
            source: 'custom-osm',
            filter: ['==', ['get', 'highway'], 'residential'],
            paint: {
              'line-color': '#fb923c',
              'line-width': 2,
              'line-opacity': 0.7,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });

          mapRef.current.addLayer({
            id: 'custom-roads-paths',
            type: 'line',
            source: 'custom-osm',
            filter: ['in', ['get', 'highway'], ['literal', ['path', 'track', 'footway', 'steps']]],
            paint: {
              'line-color': '#a3763d',
              'line-width': 2,
              'line-dasharray': [3, 2],
              'line-opacity': 0.8,
            },
          });

          // Barriers & gates (points and lines)
          mapRef.current.addLayer({
            id: 'custom-barriers',
            type: 'circle',
            source: 'custom-osm',
            filter: ['any',
              ['has', 'barrier'],
              ['==', ['get', 'access'], 'no'],
            ],
            paint: {
              'circle-radius': 5,
              'circle-color': [
                'case',
                ['==', ['get', 'access'], 'no'], '#ef4444',
                ['==', ['get', 'barrier'], 'gate'], '#f97316',
                '#8b5cf6'
              ],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.9,
            },
          });

          // Buildings
          mapRef.current.addLayer({
            id: 'custom-buildings',
            type: 'fill',
            source: 'custom-osm',
            filter: ['has', 'building'],
            paint: {
              'fill-color': '#6366f1',
              'fill-opacity': 0.15,
              'fill-outline-color': '#818cf8',
            },
          });
        })
        .catch(err => console.warn('Custom OSM overlay load failed:', err));
    });

    // Handle clicks on Mapillary features or the map in general
    map.on('click', (e) => {
      try {
        // Check if we clicked on a Mapillary image point first
        if (map.getLayer('mapillary-images')) {
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
        }

        // Check sequence lines (they have sequence_id but not individual image_id)
        if (map.getLayer('mapillary-sequences')) {
          const seqFeatures = map.queryRenderedFeatures(e.point, {
            layers: ['mapillary-sequences']
          });

          if (seqFeatures.length > 0) {
            // For sequences, we do a lat/lng search to find the nearest image
            onMapClick?.(e.lngLat.lat, e.lngLat.lng, null);
            return;
          }
        }
      } catch (err) {
        console.warn('Map feature query warning:', err);
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

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update theme dynamically (only when theme actually changes)
  const currentThemeRef = useRef(theme);
  useEffect(() => {
    if (!mapRef.current) return;
    if (currentThemeRef.current === theme) return;
    currentThemeRef.current = theme;

    mapRef.current.setStyle(getStyleObj(theme));
    
    // We need to re-add the Mapillary layers and coverage lines after style changes
    // setStyle replaces everything, so we listen for the next 'style.load'
    mapRef.current.once('style.load', () => {
      coneLayerAdded.current = false; // Trigger cone layer re-add if needed
      
      // Re-add sources and layers (extracting the logic from initial load)
      if (!mapRef.current.getSource('mapillary')) {
        mapRef.current.addSource('mapillary', {
          type: 'vector',
          tiles: [
            'https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9'
          ],
          minzoom: 6,
          maxzoom: 14
        });
      }

      if (!mapRef.current.getLayer('mapillary-sequences')) {
        mapRef.current.addLayer({
          id: 'mapillary-sequences',
          type: 'line',
          source: 'mapillary',
          'source-layer': 'sequence',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-opacity': 0.6, 'line-color': '#05CB63', 'line-width': 2 }
        });
      }

      if (!mapRef.current.getLayer('mapillary-images')) {
        mapRef.current.addLayer({
          id: 'mapillary-images',
          type: 'circle',
          source: 'mapillary',
          'source-layer': 'image',
          paint: { 'circle-radius': 3, 'circle-color': '#05CB63', 'circle-opacity': 0.8 },
          minzoom: 14
        });
      }

      if (!mapRef.current.getSource('coverage-lines')) {
        mapRef.current.addSource('coverage-lines', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        mapRef.current.addLayer({
          id: 'coverage-lines-layer',
          type: 'line',
          source: 'coverage-lines',
          paint: { 'line-color': '#4361ee', 'line-width': 3, 'line-opacity': 0.5 },
        });
      }

      if (!mapRef.current.getSource('view-cone')) {
        mapRef.current.addSource('view-cone', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        mapRef.current.addLayer({
          id: 'view-cone-layer',
          type: 'fill',
          source: 'view-cone',
          paint: { 'fill-color': '#4cc9f0', 'fill-opacity': 0.2 },
        });
      }

      if (!mapRef.current.getSource('route-line')) {
        mapRef.current.addSource('route-line', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        mapRef.current.addLayer({
          id: 'route-line-casing',
          type: 'line',
          source: 'route-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#1e3a5f', 'line-width': 10, 'line-opacity': 0.4 },
        });
        mapRef.current.addLayer({
          id: 'route-line-layer',
          type: 'line',
          source: 'route-line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.85 },
        });
      }

      if (!mapRef.current.getSource('trail-corridors')) {
        mapRef.current.addSource('trail-corridors', {
          type: 'geojson',
          data: LAGANGILANG_TRAIL_CORRIDORS,
        });
        mapRef.current.addLayer({
          id: 'trail-surveyed-layer',
          type: 'line',
          source: 'trail-corridors',
          filter: ['==', ['get', 'status'], 'surveyed'],
          paint: { 'line-color': '#06d6a0', 'line-width': 3.5, 'line-opacity': 0.8 },
        });
        mapRef.current.addLayer({
          id: 'trail-gaps-layer',
          type: 'line',
          source: 'trail-corridors',
          filter: ['==', ['get', 'status'], 'gap'],
          paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 2], 'line-opacity': 0.9 },
        });
      }

      // Custom OSM Overlay
      fetch('/data/lagangilang-custom.geojson')
        .then(r => r.json())
        .then(geojson => {
          if (!mapRef.current) return;
          if (!mapRef.current.getSource('custom-osm')) {
            mapRef.current.addSource('custom-osm', { type: 'geojson', data: geojson });
            mapRef.current.addLayer({
              id: 'custom-roads-primary', type: 'line', source: 'custom-osm',
              filter: ['in', ['get', 'highway'], ['literal', ['primary', 'secondary', 'tertiary']]],
              paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-opacity': 0.8 },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
            mapRef.current.addLayer({
              id: 'custom-roads-residential', type: 'line', source: 'custom-osm',
              filter: ['==', ['get', 'highway'], 'residential'],
              paint: { 'line-color': '#fb923c', 'line-width': 2, 'line-opacity': 0.7 },
              layout: { 'line-cap': 'round', 'line-join': 'round' },
            });
            mapRef.current.addLayer({
              id: 'custom-roads-paths', type: 'line', source: 'custom-osm',
              filter: ['in', ['get', 'highway'], ['literal', ['path', 'track', 'footway', 'steps']]],
              paint: { 'line-color': '#a3763d', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
            });
            mapRef.current.addLayer({
              id: 'custom-barriers', type: 'circle', source: 'custom-osm',
              filter: ['any', ['has', 'barrier'], ['==', ['get', 'access'], 'no']],
              paint: {
                'circle-radius': 5,
                'circle-color': ['case', ['==', ['get', 'access'], 'no'], '#ef4444', ['==', ['get', 'barrier'], 'gate'], '#f97316', '#8b5cf6'],
                'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-opacity': 0.9,
              },
            });
            mapRef.current.addLayer({
              id: 'custom-buildings', type: 'fill', source: 'custom-osm',
              filter: ['has', 'building'],
              paint: { 'fill-color': '#6366f1', 'fill-opacity': 0.15, 'fill-outline-color': '#818cf8' },
            });
          }
        })
        .catch(err => console.warn('Custom OSM overlay reload failed:', err));

      coneLayerAdded.current = true;
      
      // Force trigger the data updates
      window.dispatchEvent(new Event('map-style-loaded'));
    });
  }, [theme, getStyleObj]);

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
      el.style.transform = 'scale(1.5)';
      if (pano.id === activePanoId) {
        el.classList.add('active');
      }
      el.dataset.panoId = pano.id;

      el.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent map click (which might trigger Mapillary search)
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

    const updateLines = () => {
      const source = mapRef.current?.getSource('coverage-lines');
      if (source) {
        source.setData({ type: 'FeatureCollection', features });
      }
    };
    
    updateLines();
    window.addEventListener('map-style-loaded', updateLines);
    return () => window.removeEventListener('map-style-loaded', updateLines);
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

    const updateCone = () => {
      const map = mapRef.current;
      if (!map) return;
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
    };
    
    updateCone();
    window.addEventListener('map-style-loaded', updateCone);
    return () => window.removeEventListener('map-style-loaded', updateCone);
  }, [viewerHeading, activePanoId, panoramas]);

  // Update Tourist Spot (POI) markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing POI markers
    poiMarkersRef.current.forEach((m) => m.remove());
    poiMarkersRef.current = [];

    if (!touristSpots || touristSpots.length === 0) return;

    touristSpots.forEach((spot) => {
      const lat = spot.location?.lat ?? spot.lat;
      const lng = spot.location?.lng ?? spot.lng;
      if (lat === undefined || lng === undefined) return;

      const el = document.createElement('div');
      el.className = `poi-marker ${spot.id === activeTouristSpotId ? 'active' : ''} ${
        spot.sync_status === 'staged_local' ? 'staged' : ''
      }`;
      el.dataset.poiId = spot.id;

      el.innerHTML = `
        <div class="poi-marker-pin">
          <span class="poi-marker-icon">⭐</span>
        </div>
        <div class="poi-marker-label">${spot.name}</div>
        <div class="poi-marker-tooltip">${spot.category || ''}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectTouristSpot?.(spot);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);

      poiMarkersRef.current.push(marker);
    });

    return () => {
      poiMarkersRef.current.forEach((m) => m.remove());
      poiMarkersRef.current = [];
    };
  }, [touristSpots, activeTouristSpotId, onSelectTouristSpot]);

  // Fly to active tourist spot when selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeTouristSpotId) return;

    const spot = touristSpots?.find((s) => s.id === activeTouristSpotId);
    if (spot) {
      const lat = spot.location?.lat ?? spot.lat;
      const lng = spot.location?.lng ?? spot.lng;
      if (lat && lng) {
        map.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 16),
          duration: 800,
        });
      }
    }
  }, [activeTouristSpotId, touristSpots]);

  // Toggle Coverage Gaps & Trail Corridors visibility (Research Objective 1)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = showCoverageGaps ? 'visible' : 'none';

    if (map.getLayer('trail-surveyed-layer')) {
      map.setLayoutProperty('trail-surveyed-layer', 'visibility', visibility);
    }
    if (map.getLayer('trail-gaps-layer')) {
      map.setLayoutProperty('trail-gaps-layer', 'visibility', visibility);
    }
  }, [showCoverageGaps]);

  // Toggle Custom OSM overlay visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = showCustomOSM ? 'visible' : 'none';
    const layers = ['custom-roads-primary', 'custom-roads-residential', 'custom-roads-paths', 'custom-barriers', 'custom-buildings'];
    layers.forEach(id => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visibility);
      }
    });
  }, [showCustomOSM]);

  // Update route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateRoute = () => {
      const source = mapRef.current?.getSource('route-line');
      if (!source) return;

      if (routeGeoJSON) {
        source.setData({
          type: 'Feature',
          geometry: routeGeoJSON,
          properties: {},
        });
      } else {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    updateRoute();
    window.addEventListener('map-style-loaded', updateRoute);
    return () => window.removeEventListener('map-style-loaded', updateRoute);
  }, [routeGeoJSON]);

  // Route origin & destination markers
  const routeMarkersRef = useRef([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing route markers
    routeMarkersRef.current.forEach(m => m.remove());
    routeMarkersRef.current = [];

    if (routeOrigin) {
      const el = document.createElement('div');
      el.className = 'route-marker route-marker-origin';
      el.innerHTML = '<div class="route-marker-dot">A</div>';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(routeOrigin)
        .addTo(map);
      routeMarkersRef.current.push(marker);
    }

    if (routeDestination) {
      const el = document.createElement('div');
      el.className = 'route-marker route-marker-destination';
      el.innerHTML = '<div class="route-marker-dot">B</div>';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(routeDestination)
        .addTo(map);
      routeMarkersRef.current.push(marker);
    }

    return () => {
      routeMarkersRef.current.forEach(m => m.remove());
      routeMarkersRef.current = [];
    };
  }, [routeOrigin, routeDestination]);

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

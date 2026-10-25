import React, { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { calculateBearing } from '../utils/geoUtils';
import { normalizeCategoryName, getDefaultCategoryIcon } from '../services/touristSpotsService';
import { streetviewAlignmentService } from '../services/streetviewAlignmentService';

setWorkerUrl(maplibreWorkerUrl);

// Coverage Gaps & Trail Corridors in Lagangilang, Abra (Research Objective 1: Unsurveyed Corridors)
const LAGANGILANG_TRAIL_CORRIDORS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        name: 'Surveyed Road Corridor: UA Campus to Abra-Kalinga Main Road',
        status: 'surveyed',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [120.738083, 17.608250], // UA Campus Grounds & Gymnasium
          [120.738111, 17.608167], // Campus Entrance Gate
          [120.738139, 17.608139], // Access Road (Mapillary Sequence Start)
          [120.738167, 17.608083],
          [120.738222, 17.608000],
          [120.738250, 17.607917],
          [120.738306, 17.607750],
          [120.738361, 17.607583],
          [120.738389, 17.607556],
          [120.738417, 17.607472], // Junction with Abra-Kalinga National Road (Main Road)
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Surveyed Road Corridor: Abra-Kalinga Main Road to Poblacion Center',
        status: 'surveyed',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [120.738417, 17.607472], // Road Junction
          [120.738089, 17.611573], // Along Main Road North
          [120.737382, 17.613777],
          [120.734200, 17.614200], // Poblacion Town Hall & Freedom Park
          [120.735000, 17.615800], // Holy Cross Parish Church
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
        name: 'Unsurveyed River Corridor Gap: Pawa Rapids to Abra Riverbank',
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
  panoramas = [],
  activePanoId = null,
  onSelectPano,
  onMapClick,
  onMapContextMenu,
  viewerHeading,
  streetViewPos = null,
  mapCenter,
  mapZoom,
  touristSpots = [],
  activeTouristSpotId = null,
  onSelectTouristSpot,
  onSpotLocationChange,
  showCoverageGaps = true,
  routeGeoJSON,
  routeOrigin,
  routeDestination,
  showCustomOSM = true,
  routingMode = false,
  pickingMode = null,
  isAdmin = false,
  isDraggable = false,
  viewerOpen = false,
  aligningSequence = null,
  onUpdateAligningSequence,
  alignedGeoJSON = null,
  isSelectingAlignmentTarget = false,
  onSelectSequenceForAlignment,
  showMapillaryDots = true,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const poiMarkersRef = useRef([]);
  const coneLayerAdded = useRef(false);

  // Keep latest alignment sequence & update callback refs
  const draggingHandleIndex = useRef(null);
  const aligningSequenceRef = useRef(aligningSequence);
  useEffect(() => {
    aligningSequenceRef.current = aligningSequence;
  }, [aligningSequence]);

  const onUpdateAligningSequenceRef = useRef(onUpdateAligningSequence);
  useEffect(() => {
    onUpdateAligningSequenceRef.current = onUpdateAligningSequence;
  }, [onUpdateAligningSequence]);

  const isSelectingAlignmentTargetRef = useRef(isSelectingAlignmentTarget);
  useEffect(() => {
    isSelectingAlignmentTargetRef.current = isSelectingAlignmentTarget;
  }, [isSelectingAlignmentTarget]);

  const onSelectSequenceForAlignmentRef = useRef(onSelectSequenceForAlignment);
  useEffect(() => {
    onSelectSequenceForAlignmentRef.current = onSelectSequenceForAlignment;
  }, [onSelectSequenceForAlignment]);

  // Trigger map resize when viewer opens or closes to prevent blanking
  useEffect(() => {
    if (!mapRef.current) return;
    const t1 = setTimeout(() => mapRef.current?.resize(), 50);
    const t2 = setTimeout(() => mapRef.current?.resize(), 200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [viewerOpen]);
  const suppressClickRef = useRef(false);

  // Keep latest isAdmin ref
  const isAdminRef = useRef(isAdmin);
  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  // Keep latest onMapClick ref to avoid stale closures in MapLibre event listeners
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  // Keep latest onMapContextMenu ref
  const onMapContextMenuRef = useRef(onMapContextMenu);
  useEffect(() => {
    onMapContextMenuRef.current = onMapContextMenu;
  }, [onMapContextMenu]);

  // Update cursor when picking points on the map
  useEffect(() => {
    if (!mapRef.current) return;
    const canvas = mapRef.current.getCanvas();
    if (canvas) {
      canvas.style.cursor = routingMode || pickingMode ? 'crosshair' : '';
    }
  }, [routingMode, pickingMode]);

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
      maxZoom: theme === 'satellite' ? 19 : 22,
      pitch: 0,
      antialias: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Handle missing sprite images (e.g. OpenFreeMap 'multi' shield icon)
    map.on('styleimagemissing', (e) => {
      if (!map.hasImage(e.id)) {
        const width = 1;
        const height = 1;
        const data = new Uint8Array(width * height * 4);
        map.addImage(e.id, { width, height, data });
      }
    });

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

      // Mapillary Sequence Lines Casing (Dark outline for high contrast on all themes)
      map.addLayer({
        id: 'mapillary-sequences-casing',
        type: 'line',
        source: 'mapillary',
        'source-layer': 'sequence',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#064e3b',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5, 17, 8],
          'line-opacity': 0.7,
        },
      });

      // Mapillary Sequence Lines (Continuous Vibrant Green)
      map.addLayer({
        id: 'mapillary-sequences',
        type: 'line',
        source: 'mapillary',
        'source-layer': 'sequence',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#05cb63',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 3.5, 17, 5],
          'line-opacity': 0.95,
        },
      });

      // Mapillary Image Points (Green Dots with White Halo)
      map.addLayer({
        id: 'mapillary-images',
        type: 'circle',
        source: 'mapillary',
        'source-layer': 'image',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3.5, 16, 6, 18, 8],
          'circle-color': '#05cb63',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
        minzoom: 13,
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

      // Aligned Streetview Lines Source & Layers (user-aligned, smooth realistic lines on roads)
      map.addSource('aligned-streetview-source', {
        type: 'geojson',
        data: alignedGeoJSON || streetviewAlignmentService.toGeoJSON(),
      });

      map.addLayer({
        id: 'aligned-streetview-casing',
        type: 'line',
        source: 'aligned-streetview-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#064e3b',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 17, 9],
          'line-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'aligned-streetview-layer',
        type: 'line',
        source: 'aligned-streetview-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#00f0ff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 4, 17, 6],
          'line-opacity': 0.98,
        },
      });

      // Active Line Alignment Editor Layers (when bending lines)
      map.addSource('active-align-line-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'active-align-line-casing',
        type: 'line',
        source: 'active-align-line-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0284c7',
          'line-width': 10,
          'line-opacity': 0.6,
        },
      });

      map.addLayer({
        id: 'active-align-line-inner',
        type: 'line',
        source: 'active-align-line-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#38bdf8',
          'line-width': 5,
          'line-opacity': 0.95,
          'line-dasharray': [2, 1],
        },
      });

      map.addSource('active-align-handles-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'active-align-handles-layer',
        type: 'circle',
        source: 'active-align-handles-source',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 15, 9, 18, 12],
          'circle-color': '#00f0ff',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1,
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

      // Signal map layers are loaded and ready for GeoJSON data
      window.dispatchEvent(new Event('map-style-loaded'));
    });

    // Helper to safely extract a sequence ID from any Mapillary feature
    const extractMapillarySequenceId = (feature) => {
      if (!feature) return null;
      if (feature.layer?.id === 'mapillary-sequences' || feature.layer?.id === 'mapillary-sequences-casing') {
        const id = feature.properties?.id || feature.properties?.sequence_id || feature.properties?.sequence || feature.id;
        return id ? String(id) : null;
      }
      if (feature.layer?.id === 'mapillary-images') {
        const id = feature.properties?.sequence_id || feature.properties?.sequence;
        return id ? String(id) : null;
      }
      if (feature.layer?.id === 'aligned-streetview-layer' || feature.layer?.id === 'aligned-streetview-casing') {
        return feature.properties?.sequenceId ? String(feature.properties.sequenceId) : null;
      }
      return null;
    };

    // Helper to safely extract a valid 64-bit Mapillary image ID (never an internal sequence ID or vector tile index)
    const extractMapillaryImageId = (feature) => {
      if (!feature) return null;
      // Never use properties.id from a sequence feature (it is a sequence ID, not an image ID)
      if (feature.layer?.id === 'mapillary-sequences') {
        const seqImageId = feature.properties?.image_id;
        if (seqImageId && String(seqImageId).length >= 10 && /^\d+$/.test(String(seqImageId))) {
          return String(seqImageId);
        }
        return null;
      }
      // Properties.id on image point features
      const propId = feature.properties?.id;
      if (propId && String(propId).length >= 10 && /^\d+$/.test(String(propId))) {
        return String(propId);
      }
      return null;
    };

    // Handle clicks on Mapillary features or the map in general
    map.on('click', (e) => {
      // Suppress synthetic clicks following a touch long-press gesture
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }

      try {
        // Check if user is in "Select Streetview to Align" mode
        if (isSelectingAlignmentTargetRef.current) {
          const hitBox = [
            [e.point.x - 22, e.point.y - 22],
            [e.point.x + 22, e.point.y + 22],
          ];
          const seqFeatures = map.queryRenderedFeatures(hitBox, {
            layers: ['mapillary-sequences', 'mapillary-images', 'aligned-streetview-layer'],
          });
          if (seqFeatures.length > 0) {
            const seqId = extractMapillarySequenceId(seqFeatures[0]);
            if (seqId) {
              onSelectSequenceForAlignmentRef.current?.(seqId, e.lngLat.lat, e.lngLat.lng);
              return;
            }
          }
        }

        // If currently aligning, but user clicks directly on a different streetview line to switch
        if (aligningSequenceRef.current && !map.queryRenderedFeatures(e.point, { layers: ['active-align-handles-layer'] }).length) {
          const hitBox = [
            [e.point.x - 18, e.point.y - 18],
            [e.point.x + 18, e.point.y + 18],
          ];
          const otherSeqFeatures = map.queryRenderedFeatures(hitBox, {
            layers: ['mapillary-sequences', 'aligned-streetview-layer'],
          });
          if (otherSeqFeatures.length > 0) {
            const otherSeqId = extractMapillarySequenceId(otherSeqFeatures[0]);
            if (otherSeqId && otherSeqId !== aligningSequenceRef.current.sequenceId) {
              onSelectSequenceForAlignmentRef.current?.(otherSeqId, e.lngLat.lat, e.lngLat.lng);
              return;
            }
          }
        }

        // 0a. If in alignment mode, clicking on the active bent line inserts a new curve handle
        if (aligningSequenceRef.current && map.getLayer('active-align-line-inner')) {
          const lineFeatures = map.queryRenderedFeatures(e.point, {
            layers: ['active-align-line-inner', 'active-align-line-casing'],
          });
          if (lineFeatures.length > 0) {
            const clickCoord = [e.lngLat.lng, e.lngLat.lat];
            const seq = aligningSequenceRef.current;
            const cps = seq.controlPoints;
            let bestIdx = 1;
            let minD = Infinity;
            for (let i = 0; i < cps.length - 1; i++) {
              const midLng = (cps[i][0] + cps[i + 1][0]) / 2;
              const midLat = (cps[i][1] + cps[i + 1][1]) / 2;
              const d = Math.hypot(clickCoord[0] - midLng, clickCoord[1] - midLat);
              if (d < minD) {
                minD = d;
                bestIdx = i + 1;
              }
            }
            const newControlPoints = [...cps];
            newControlPoints.splice(bestIdx, 0, clickCoord);
            const { coordinates, mappedImages } = streetviewAlignmentService.generateBentGeometry(
              newControlPoints,
              seq.images
            );
            onUpdateAligningSequenceRef.current?.({
              ...seq,
              controlPoints: newControlPoints,
              coordinates,
              images: mappedImages,
            });
            return;
          }
        }

        // 0b. Check if clicked on a user-aligned streetview line (Streetview is 100% active!)
        if (map.getLayer('aligned-streetview-layer')) {
          const alignedFeatures = map.queryRenderedFeatures(e.point, {
            layers: ['aligned-streetview-layer'],
          });
          if (alignedFeatures.length > 0) {
            const seqId = alignedFeatures[0].properties?.sequenceId;
            const img = streetviewAlignmentService.findClosestImage(seqId, e.lngLat.lat, e.lngLat.lng);
            if (img && img.id) {
              onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng, String(img.id), true);
              return;
            }
          }
        }
        // 1. Check if we clicked directly on a Mapillary image point
        if (map.getLayer('mapillary-images')) {
          const imageFeatures = map.queryRenderedFeatures(e.point, {
            layers: ['mapillary-images']
          });

          if (imageFeatures.length > 0) {
            const validId = extractMapillaryImageId(imageFeatures[0]);
            if (validId) {
              onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng, validId, true);
              return;
            }
          }
        }

        // 2. Check sequence lines (continuous green line)
        if (map.getLayer('mapillary-sequences')) {
          const seqFeatures = map.queryRenderedFeatures(e.point, {
            layers: ['mapillary-sequences']
          });

          if (seqFeatures.length > 0) {
            // Check if there is an image point near the click point (within 40px)
            const nearbyImageFeatures = map.queryRenderedFeatures([
              [e.point.x - 40, e.point.y - 40],
              [e.point.x + 40, e.point.y + 40],
            ], { layers: ['mapillary-images'] });

            const validId = nearbyImageFeatures.length > 0
              ? extractMapillaryImageId(nearbyImageFeatures[0])
              : null; // null triggers searchNearby to resolve the actual image ID

            onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng, validId, true);
            return;
          }
        }

        // 3. Check surveyed road corridor lines (connecting UA Campus to Main Road)
        if (map.getLayer('trail-surveyed-layer')) {
          const surveyedFeatures = map.queryRenderedFeatures(e.point, {
            layers: ['trail-surveyed-layer']
          });

          if (surveyedFeatures.length > 0) {
            onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng, null, true);
            return;
          }
        }
      } catch (err) {
        console.warn('Map feature query warning:', err);
      }

      // Normal map click (no Mapillary feature)
      onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng, null, false);
    });

    // Right-click context menu (Desktop) - Allows tourists to mark Point A/B & admins to add POIs
    map.on('contextmenu', (e) => {
      e.originalEvent?.preventDefault();

      // If in alignment mode, right-clicking on a handle removes that handle!
      if (aligningSequenceRef.current && map.getLayer('active-align-handles-layer')) {
        const handleFeatures = map.queryRenderedFeatures(e.point, {
          layers: ['active-align-handles-layer'],
        });
        if (handleFeatures.length > 0) {
          const idx = handleFeatures[0].properties?.index;
          const seq = aligningSequenceRef.current;
          if (idx !== undefined && seq.controlPoints.length > 2) {
            const newControlPoints = seq.controlPoints.filter((_, i) => i !== idx);
            const { coordinates, mappedImages } = streetviewAlignmentService.generateBentGeometry(
              newControlPoints,
              seq.images
            );
            onUpdateAligningSequenceRef.current?.({
              ...seq,
              controlPoints: newControlPoints,
              coordinates,
              images: mappedImages,
            });
            return;
          }
        }
      }
      // Query features under right-click to extract exact sequence ID
      let clickedSequenceId = null;
      try {
        const hitBox = [
          [e.point.x - 24, e.point.y - 24],
          [e.point.x + 24, e.point.y + 24],
        ];
        const seqFeatures = map.queryRenderedFeatures(hitBox, {
          layers: ['mapillary-sequences', 'mapillary-images', 'aligned-streetview-layer'],
        });
        if (seqFeatures.length > 0) {
          clickedSequenceId = extractMapillarySequenceId(seqFeatures[0]);
        }
      } catch (_) {}

      const screenX = e.originalEvent?.clientX ?? 0;
      const screenY = e.originalEvent?.clientY ?? 0;
      onMapContextMenuRef.current?.(e.lngLat.lat, e.lngLat.lng, screenX, screenY, clickedSequenceId);
    });

    // ========== Touchscreen Long-Press Gesture (Right-Click on Touch) ==========
    let touchTimer = null;
    let touchStartPoint = null;
    let touchStartLngLat = null;
    let touchScreenX = 0;
    let touchScreenY = 0;
    let longPressTriggered = false;
    let suppressTimeout = null;

    // Visual ripple indicator ring for touch-and-hold
    const touchIndicator = document.createElement('div');
    touchIndicator.className = 'touch-hold-indicator';
    touchIndicator.style.display = 'none';
    mapContainerRef.current?.appendChild(touchIndicator);

    const cancelTouchHold = () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
      touchIndicator.style.display = 'none';
      touchIndicator.classList.remove('active');
    };

    map.on('touchstart', (e) => {
      // Disregard multi-touch gestures (e.g. pinch-to-zoom or rotate)
      if (e.points && e.points.length > 1) {
        cancelTouchHold();
        return;
      }

      const touch = e.originalEvent?.touches?.[0];
      if (!touch) return;

      longPressTriggered = false;
      touchStartPoint = { x: e.point.x, y: e.point.y };
      touchStartLngLat = e.lngLat;
      touchScreenX = touch.clientX;
      touchScreenY = touch.clientY;

      // Position the visual expanding ripple ring right under the user's finger
      const containerRect = mapContainerRef.current?.getBoundingClientRect();
      if (containerRect) {
        touchIndicator.style.left = `${touch.clientX - containerRect.left}px`;
        touchIndicator.style.top = `${touch.clientY - containerRect.top}px`;
        touchIndicator.style.display = 'block';
        void touchIndicator.offsetWidth; // Trigger reflow for CSS animation
        touchIndicator.classList.add('active');
      }

      touchTimer = setTimeout(() => {
        longPressTriggered = true;
        cancelTouchHold();

        // Haptic vibration feedback for mobile devices (if supported by browser/device)
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(45);
          } catch (_) {}
        }

        // Check touch target for streetview sequence
        let touchSequenceId = null;
        try {
          const hitBox = [
            [touchStartPoint.x - 30, touchStartPoint.y - 30],
            [touchStartPoint.x + 30, touchStartPoint.y + 30],
          ];
          const seqFeatures = map.queryRenderedFeatures(hitBox, {
            layers: ['mapillary-sequences', 'mapillary-images', 'aligned-streetview-layer'],
          });
          if (seqFeatures.length > 0) {
            touchSequenceId = extractMapillarySequenceId(seqFeatures[0]);
          }
        } catch (_) {}

        // Trigger context menu with touch coordinates and sequence ID
        onMapContextMenuRef.current?.(
          touchStartLngLat.lat,
          touchStartLngLat.lng,
          touchScreenX,
          touchScreenY,
          touchSequenceId
        );
      }, 500);
    });

    map.on('touchmove', (e) => {
      if (!touchTimer || !touchStartPoint) return;
      // If the user's finger moves more than 10px, it is a map pan/drag, cancel hold
      const dx = e.point.x - touchStartPoint.x;
      const dy = e.point.y - touchStartPoint.y;
      if (Math.hypot(dx, dy) > 10) {
        cancelTouchHold();
      }
    });

    map.on('touchend', (e) => {
      cancelTouchHold();
      if (longPressTriggered) {
        e.originalEvent?.preventDefault();
        suppressClickRef.current = true;
        if (suppressTimeout) clearTimeout(suppressTimeout);
        suppressTimeout = setTimeout(() => {
          suppressClickRef.current = false;
        }, 400);
        longPressTriggered = false;
      }
    });

    map.on('touchcancel', () => {
      cancelTouchHold();
      longPressTriggered = false;
    });

    // Change cursor when hovering over Mapillary layers & surveyed corridors
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
    map.on('mouseenter', 'trail-surveyed-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'trail-surveyed-layer', () => {
      map.getCanvas().style.cursor = '';
    });

    // Hover cursor for user-aligned streetview lines
    map.on('mouseenter', 'aligned-streetview-layer', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'aligned-streetview-layer', () => {
      if (draggingHandleIndex.current === null) {
        map.getCanvas().style.cursor = '';
      }
    });

    // Alignment Handle Dragging (60 FPS interactive line bending)
    map.on('mouseenter', 'active-align-handles-layer', () => {
      map.getCanvas().style.cursor = 'grab';
    });
    map.on('mouseleave', 'active-align-handles-layer', () => {
      if (draggingHandleIndex.current === null) {
        map.getCanvas().style.cursor = '';
      }
    });

    map.on('mousedown', 'active-align-handles-layer', (e) => {
      if (!aligningSequenceRef.current) return;
      e.originalEvent?.preventDefault();
      const feature = e.features?.[0];
      if (feature && feature.properties?.index !== undefined) {
        draggingHandleIndex.current = feature.properties.index;
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'grabbing';
      }
    });

    map.on('mousemove', (e) => {
      if (draggingHandleIndex.current !== null && aligningSequenceRef.current) {
        const idx = draggingHandleIndex.current;
        const seq = aligningSequenceRef.current;
        const newControlPoints = [...seq.controlPoints];
        newControlPoints[idx] = [e.lngLat.lng, e.lngLat.lat];

        const { coordinates, mappedImages } = streetviewAlignmentService.generateBentGeometry(
          newControlPoints,
          seq.images
        );

        const lineSrc = map.getSource('active-align-line-source');
        const handlesSrc = map.getSource('active-align-handles-source');

        if (lineSrc) {
          lineSrc.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates } }],
          });
        }

        if (handlesSrc) {
          handlesSrc.setData({
            type: 'FeatureCollection',
            features: newControlPoints.map((cp, i) => ({
              type: 'Feature',
              properties: { index: i },
              geometry: { type: 'Point', coordinates: cp },
            })),
          });
        }

        onUpdateAligningSequenceRef.current?.({
          ...seq,
          controlPoints: newControlPoints,
          coordinates,
          images: mappedImages,
        });
      }
    });

    const onGlobalMouseUp = () => {
      if (draggingHandleIndex.current !== null) {
        draggingHandleIndex.current = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = '';
      }
    };

    map.on('mouseup', onGlobalMouseUp);

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
      cancelTouchHold();
      if (touchIndicator.parentNode) {
        touchIndicator.remove();
      }
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

    mapRef.current.setMaxZoom(theme === 'satellite' ? 19 : 22);
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

      if (!mapRef.current.getLayer('mapillary-sequences-casing')) {
        mapRef.current.addLayer({
          id: 'mapillary-sequences-casing',
          type: 'line',
          source: 'mapillary',
          'source-layer': 'sequence',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#064e3b',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 5, 17, 8],
            'line-opacity': 0.7,
          },
        });
      }

      if (!mapRef.current.getLayer('mapillary-sequences')) {
        mapRef.current.addLayer({
          id: 'mapillary-sequences',
          type: 'line',
          source: 'mapillary',
          'source-layer': 'sequence',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#05cb63',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 3.5, 17, 5],
            'line-opacity': 0.95,
          },
        });
      }

      if (!mapRef.current.getLayer('mapillary-images')) {
        mapRef.current.addLayer({
          id: 'mapillary-images',
          type: 'circle',
          source: 'mapillary',
          'source-layer': 'image',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3.5, 16, 6, 18, 8],
            'circle-color': '#05cb63',
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          },
          minzoom: 13,
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
      }

      if (!mapRef.current.getSource('aligned-streetview-source')) {
        mapRef.current.addSource('aligned-streetview-source', {
          type: 'geojson',
          data: alignedGeoJSON || streetviewAlignmentService.toGeoJSON(),
        });
        mapRef.current.addLayer({
          id: 'aligned-streetview-casing',
          type: 'line',
          source: 'aligned-streetview-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#064e3b',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 17, 9],
            'line-opacity': 0.85,
          },
        });
        mapRef.current.addLayer({
          id: 'aligned-streetview-layer',
          type: 'line',
          source: 'aligned-streetview-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#00f0ff',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 4, 17, 6],
            'line-opacity': 0.98,
          },
        });
      }

      if (!mapRef.current.getSource('active-align-line-source')) {
        mapRef.current.addSource('active-align-line-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        mapRef.current.addLayer({
          id: 'active-align-line-casing',
          type: 'line',
          source: 'active-align-line-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0284c7',
            'line-width': 10,
            'line-opacity': 0.6,
          },
        });
        mapRef.current.addLayer({
          id: 'active-align-line-inner',
          type: 'line',
          source: 'active-align-line-source',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#38bdf8',
            'line-width': 5,
            'line-opacity': 0.95,
            'line-dasharray': [2, 1],
          },
        });
        mapRef.current.addSource('active-align-handles-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        mapRef.current.addLayer({
          id: 'active-align-handles-layer',
          type: 'circle',
          source: 'active-align-handles-source',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 15, 9, 18, 12],
            'circle-color': '#00f0ff',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 1,
          },
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

  // Active Street View Marker on 2D Map
  const streetViewMarkerRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (streetViewPos && streetViewPos.lat !== undefined && streetViewPos.lng !== undefined) {
      // Pan map smoothly to the street view location if not currently in view
      const bounds = map.getBounds();
      const inView = bounds && bounds.contains([streetViewPos.lng, streetViewPos.lat]);
      if (!inView) {
        map.flyTo({ center: [streetViewPos.lng, streetViewPos.lat], zoom: Math.max(map.getZoom(), 15), duration: 1000 });
      }

      if (!streetViewMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'streetview-active-marker';
        el.style.width = '18px';
        el.style.height = '18px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#05cb63';
        el.style.border = '2px solid #ffffff';
        el.style.boxShadow = '0 0 12px #05cb63, 0 0 4px rgba(0,0,0,0.5)';
        el.style.cursor = 'pointer';
        el.title = 'Current Street View Position';

        streetViewMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([streetViewPos.lng, streetViewPos.lat])
          .addTo(map);
      } else {
        streetViewMarkerRef.current.setLngLat([streetViewPos.lng, streetViewPos.lat]);
      }
    } else if (streetViewMarkerRef.current) {
      streetViewMarkerRef.current.remove();
      streetViewMarkerRef.current = null;
    }

    return () => {
      if (streetViewMarkerRef.current) {
        streetViewMarkerRef.current.remove();
        streetViewMarkerRef.current = null;
      }
    };
  }, [streetViewPos]);

  // Update viewing direction cone for Street View
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !streetViewPos || viewerHeading === undefined || !coneLayerAdded.current) {
      const source = map?.getSource('view-cone');
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const updateCone = () => {
      const map = mapRef.current;
      if (!map || !streetViewPos || streetViewPos.lat === undefined) return;
      // Generate a cone polygon representing the viewing direction
      const cone = generateViewCone(streetViewPos.lat, streetViewPos.lng, viewerHeading, 35, 0.00035);
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
  }, [viewerHeading, streetViewPos]);

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

      const isPoi = spot.spotType === 'poi' || spot.type === 'poi';
      const cleanCategory = normalizeCategoryName(spot.category);
      const icon = spot.categoryIcon || getDefaultCategoryIcon(cleanCategory, spot.spotType) || (isPoi ? '📍' : '⭐');

      const canDrag = !!isAdmin && !!isDraggable;

      const el = document.createElement('div');
      el.className = `poi-marker ${isPoi ? 'poi-service' : 'poi-attraction'} ${
        spot.id === activeTouristSpotId ? 'active' : ''
      } ${spot.sync_status === 'staged_local' ? 'staged' : ''} ${canDrag ? 'is-admin-draggable' : ''}`;
      el.dataset.poiId = spot.id;
      el.title = canDrag ? `${spot.name} • Drag to reposition` : spot.name;

      el.innerHTML = `
        <div class="poi-marker-inner">
          <div class="poi-marker-pin ${isPoi ? 'pin-poi' : 'pin-tourist'}">
            <span class="poi-marker-icon">${icon}</span>
          </div>
          <div class="poi-marker-label">${spot.name}</div>
          <div class="poi-marker-tooltip">${cleanCategory}</div>
        </div>
      `;

      let wasDragged = false;

      el.addEventListener('click', (e) => {
        if (wasDragged) return;
        e.stopPropagation();
        onSelectTouristSpot?.(spot);
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
        draggable: canDrag,
      })
        .setLngLat([lng, lat])
        .addTo(map);

      if (canDrag) {
        marker.on('dragstart', () => {
          wasDragged = true;
          el.classList.add('is-dragging');
        });

        marker.on('dragend', () => {
          el.classList.remove('is-dragging');
          const pos = marker.getLngLat();
          onSpotLocationChange?.(spot.id, pos.lat, pos.lng);
          // Suppress click right after drop
          setTimeout(() => {
            wasDragged = false;
          }, 150);
        });
      }

      poiMarkersRef.current.push(marker);
    });

    return () => {
      poiMarkersRef.current.forEach((m) => m.remove());
      poiMarkersRef.current = [];
    };
  }, [touristSpots, activeTouristSpotId, onSelectTouristSpot, onSpotLocationChange, isAdmin, isDraggable]);

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

  // Toggle Coverage & Surveyed Trail Corridors visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = showCoverageGaps ? 'visible' : 'none';

    if (map.getLayer('trail-surveyed-layer')) {
      map.setLayoutProperty('trail-surveyed-layer', 'visibility', visibility);
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

  // Toggle Mapillary Green Dots visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visibility = showMapillaryDots ? 'visible' : 'none';

    if (map.getLayer('mapillary-images')) {
      map.setLayoutProperty('mapillary-images', 'visibility', visibility);
    }
  }, [showMapillaryDots]);

  // Update Aligned Streetview Lines GeoJSON source
  useEffect(() => {
    if (!mapRef.current) return;
    const src = mapRef.current.getSource('aligned-streetview-source');
    if (src) {
      src.setData(alignedGeoJSON || streetviewAlignmentService.toGeoJSON());
    }
  }, [alignedGeoJSON]);

  // Update Active Alignment Editor GeoJSON sources
  useEffect(() => {
    if (!mapRef.current) return;
    const lineSrc = mapRef.current.getSource('active-align-line-source');
    const handlesSrc = mapRef.current.getSource('active-align-handles-source');

    if (!aligningSequence) {
      if (lineSrc) lineSrc.setData({ type: 'FeatureCollection', features: [] });
      if (handlesSrc) handlesSrc.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const { coordinates = [], controlPoints = [] } = aligningSequence;

    if (lineSrc && coordinates.length > 1) {
      lineSrc.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates,
            },
          },
        ],
      });
    }

    if (handlesSrc) {
      handlesSrc.setData({
        type: 'FeatureCollection',
        features: controlPoints.map((cp, idx) => ({
          type: 'Feature',
          properties: { index: idx },
          geometry: {
            type: 'Point',
            coordinates: cp,
          },
        })),
      });
    }
  }, [aligningSequence]);

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

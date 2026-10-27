import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MapView from './components/MapView';
import MapillaryViewer from './components/MapillaryViewer';
import PanoramaViewer from './components/PanoramaViewer';
import GoogleStreetViewViewer from './components/GoogleStreetViewViewer';
import TouristSpotModal, { LAGANGILANG_BARANGAYS } from './components/TouristSpotModal';
import TouristSpotStreetViewCard from './components/TouristSpotStreetViewCard';
import PseudoImage from './components/PseudoImage';
import { touristSpotsService } from './services/touristSpotsService';
import { useMapillary } from './hooks/useMapillary';
import { formatCoords } from './utils/geoUtils';
import {
  isInsideUACampus,
  isNearCampusJunction,
  UA_CAMPUS_GATE,
  MAPILLARY_CAMPUS_GATE_IMAGE_ID,
} from './utils/streetViewJunctions';
import RoutePlanner from './components/RoutePlanner';
import NavigationView from './components/NavigationView';
import { getRoute } from './services/routingService';
import { streetviewAlignmentService } from './services/streetviewAlignmentService';
import StreetviewLineAligner from './components/StreetviewLineAligner';
import AdminPasswordModal from './components/AdminPasswordModal';
import EmergencyModal from './components/EmergencyModal';
import WeatherWidget from './components/WeatherWidget';
import OfflineGuideModal from './components/OfflineGuideModal';
import offlineCacheService from './services/offlineCacheService';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Main application shell.
 * Split-screen layout: Map (left) | Mapillary 360 Street View Viewer (right).
 * Powered exclusively by Mapillary API v4 and Meta CDN imagery.
 * Fullstack integration with Neon PostgreSQL, offline 2-step staging, and Lagangilang tourist spots & POIs.
 */
export default function App() {
  // App state
  const [viewerHeading, setViewerHeading] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('spots'); // 'spots' | 'staging' | 'routing'
  
  // Tourist Spots & POI State
  const [touristSpots, setTouristSpots] = useState([]);
  const [activeTouristSpot, setActiveTouristSpot] = useState(null);
  const [spotFilter, setSpotFilter] = useState('all'); // 'all' | 'tourist_spot' | 'poi'
  const [barangayFilter, setBarangayFilter] = useState('all'); // 'all' | specific barangay
  const [showSpotModal, setShowSpotModal] = useState(false);
  const [editingSpot, setEditingSpot] = useState(null);
  const [steerTarget, setSteerTarget] = useState(null);
  const [showCoverageGaps, setShowCoverageGaps] = useState(false);

  // Routing State
  const [routingMode, setRoutingMode] = useState(false);
  const [pickingTarget, setPickingTarget] = useState(null); // null | 'origin' | 'destination'
  const [isLocating, setIsLocating] = useState(false);
  const [routingProfile, setRoutingProfile] = useState('driving');
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [routeDestination, setRouteDestination] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isNavMinimized, setIsNavMinimized] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState('all'); // 'all' | 'Easy' | 'Moderate' | 'Challenging'
  const [showCustomOSM, setShowCustomOSM] = useState(true);

  // Right-click context menu state: { lat, lng, x, y } | null
  const [contextMenu, setContextMenu] = useState(null);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = useRef(null);

  // Mapillary raw streetview visibility toggles (Green sequence lines and dots) - Default OFF for clean aesthetic
  const [showMapillaryStreetview, setShowMapillaryStreetview] = useState(false);
  const [showMapillaryDots, setShowMapillaryDots] = useState(false);
  const [showMapillaryLines, setShowMapillaryLines] = useState(false);

  const showToast = useCallback((msg, duration = 3500) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, duration);
  }, []);

  // Connectivity & 2-Step Sync State (Research Objective 3: ISO/IEC 25010 Reliability)
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Theme & Auth State
  const [mapTheme, setMapTheme] = useState(() => localStorage.getItem('lagangilang_map_theme') || 'light'); // 'dark' | 'light' | 'beige' | 'satellite'
  const [isAdmin, setIsAdmin] = useState(() => {
    return sessionStorage.getItem('lagangilang_admin_authenticated') === 'true';
  });
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [isChangePasswordMode, setIsChangePasswordMode] = useState(false);
  const [pinsDraggable, setPinsDraggable] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Mapillary Street View state
  const [mapillaryImageId, setMapillaryImageId] = useState(null);
  const [streetViewPos, setStreetViewPos] = useState(null);
  const [mapillaryImages, setMapillaryImages] = useState([]);
  const [viewerPanoMode, setViewerPanoMode] = useState('dedicated'); // 'dedicated' | 'google' | 'mapillary'
  const [localPanoramas, setLocalPanoramas] = useState([]);
  const [mapCenterPos, setMapCenterPos] = useState(null);
  const { searchNearby } = useMapillary();

  // Clean up any alignment fixture keys from localStorage to ensure standard Mapillary placement
  useEffect(() => {
    try {
      localStorage.removeItem('lagangilang_mapillary_offset_x');
      localStorage.removeItem('lagangilang_mapillary_offset_y');
      localStorage.removeItem('lagangilang_sequence_offsets');
    } catch (_) {}
  }, []);

  // Map resize & layout mode ('split' = 50/50 half screen, 'fullscreen' = 100% viewer)
  const [mapWidth, setMapWidth] = useState(50); // percentage (default half screen)
  const [viewerLayout, setViewerLayout] = useState('split'); // 'split' | 'fullscreen'
  const resizing = useRef(false);

  // Network connectivity listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Geolocation: get user's current position with robust high-accuracy + standard fallbacks
  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);

    const onLocationSuccess = (pos) => {
      setIsLocating(false);
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(loc);
      setRouteOrigin([loc.lng, loc.lat]);
      setRouteData(null);
      setSidebarTab('routing');
      setSidebarOpen(true);
    };

    const onLocationError = (err) => {
      console.warn('High-accuracy GPS failed or timed out, trying standard accuracy:', err);
      // Fallback with standard network/wifi accuracy (crucial for laptops)
      navigator.geolocation.getCurrentPosition(
        onLocationSuccess,
        (fallbackErr) => {
          setIsLocating(false);
          console.warn('Geolocation completely unavailable:', fallbackErr);
          const useTownPlaza = window.confirm(
            'GPS location could not be determined (permissions may be blocked or device has no GPS sensor).\n\nWould you like to set Lagangilang Town Plaza (Poblacion) as Point A (Start)?'
          );
          if (useTownPlaza) {
            setRouteOrigin([120.734, 17.6142]); // Poblacion Town Plaza
            setRouteData(null);
            setSidebarTab('routing');
            setSidebarOpen(true);
          }
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      onLocationSuccess,
      onLocationError,
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Route to a specific tourist spot
  const handleRouteToSpot = useCallback((spot) => {
    const lat = spot.location?.lat ?? spot.lat;
    const lng = spot.location?.lng ?? spot.lng;
    setRouteDestination([lng, lat]);
    setSidebarTab('routing');
    setSidebarOpen(true);
    // If user location is available, auto-set origin
    if (userLocation) {
      setRouteOrigin([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation]);

  // Copy coordinates handler with fallback & instant visual feedback
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [copiedImageKey, setCopiedImageKey] = useState(false);
  const handleCopyCoordinates = useCallback(async (lat, lng) => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    let ok = false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (err) {
        console.warn('Clipboard writeText failed:', err);
      }
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (err) {
        console.error('execCommand copy failed:', err);
      }
    }
    setCopiedCoords(true);
    showToast(`📍 Copied coordinates: ${text}`);
    setTimeout(() => {
      setCopiedCoords(false);
    }, 2000);
  }, [showToast]);

  // Streetview Line Alignment & Bending State
  const [aligningSequence, setAligningSequence] = useState(null);
  const [isSelectingAlignmentTarget, setIsSelectingAlignmentTarget] = useState(false);
  const [alignedGeoJSON, setAlignedGeoJSON] = useState(() => streetviewAlignmentService.toGeoJSON());
  const [isSavingAlignment, setIsSavingAlignment] = useState(false);

  const handleSelectSequenceForAlignment = useCallback(async (sequenceId, lat, lng) => {
    if (!isAdmin) {
      showToast('🔒 Line alignment is restricted to Admin only.');
      return;
    }
    setIsSelectingAlignmentTarget(false);
    try {
      showToast(`⏳ Loading sequence ${sequenceId.slice(0, 8)}... for alignment`);
      const seqData = await streetviewAlignmentService.fetchSequenceById(sequenceId, lat, lng);
      const { coordinates, mappedImages } = streetviewAlignmentService.generateBentGeometry(
        seqData.controlPoints,
        seqData.images
      );
      setAligningSequence({
        ...seqData,
        coordinates,
        images: mappedImages,
      });
      showToast(`📐 Alignment Mode: Drag handles to bend ${seqData.name || 'line'} onto the road curve!`);
    } catch (err) {
      console.error('Error starting sequence alignment:', err);
      showToast(`⚠️ ${err.message || 'Could not load sequence'}`);
    }
  }, [isAdmin, showToast]);

  const handleStartAligningAtCoord = useCallback(async (lat, lng, sequenceId = null) => {
    if (!isAdmin) {
      showToast('🔒 Line alignment is restricted to Admin only.');
      return;
    }
    setIsSelectingAlignmentTarget(false);
    try {
      showToast(`⏳ Loading sequence ${sequenceId ? sequenceId.slice(0, 8) + '...' : ''} for alignment...`);
      const seqData = sequenceId
        ? await streetviewAlignmentService.fetchSequenceById(sequenceId, lat, lng)
        : await streetviewAlignmentService.fetchNearbySequence(lat, lng);
      const { coordinates, mappedImages } = streetviewAlignmentService.generateBentGeometry(
        seqData.controlPoints,
        seqData.images
      );
      setAligningSequence({
        ...seqData,
        coordinates,
        images: mappedImages,
      });
      showToast(`📐 Alignment Mode: Drag handles to bend ${seqData.name || 'line'} onto road curve!`);
    } catch (err) {
      showToast(`⚠️ ${err.message || 'No Mapillary sequence found at this point'}`);
    }
  }, [showToast]);

  const handleSaveAlignment = useCallback(async () => {
    if (!aligningSequence) return;
    setIsSavingAlignment(true);
    try {
      await streetviewAlignmentService.saveAlignedSequence(aligningSequence.sequenceId, {
        coordinates: aligningSequence.coordinates,
        controlPoints: aligningSequence.controlPoints,
        images: aligningSequence.images,
      });
      setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
      setAligningSequence(null);
      showToast('💾 Streetview alignment saved! Streetview is 100% active along the line.');
    } catch (err) {
      console.error('Save alignment error:', err);
      showToast('⚠️ Failed to save alignment');
    } finally {
      setIsSavingAlignment(false);
    }
  }, [aligningSequence, showToast]);

  const handleResetAlignmentOriginal = useCallback(() => {
    if (!aligningSequence) return;
    const rawCoords = aligningSequence.images.map((img) => [img.originalLng || img.lng, img.originalLat || img.lat]);
    const handleCount = Math.max(6, Math.min(14, Math.ceil(rawCoords.length / 8)));
    const controlPoints = [];
    const step = (rawCoords.length - 1) / (handleCount - 1);

    for (let i = 0; i < handleCount; i++) {
      const idx = Math.min(rawCoords.length - 1, Math.round(i * step));
      controlPoints.push([...rawCoords[idx]]);
    }

    const { coordinates, mappedImages } = streetviewAlignmentService.generateBentGeometry(
      controlPoints,
      aligningSequence.images
    );

    setAligningSequence({
      ...aligningSequence,
      controlPoints,
      coordinates,
      images: mappedImages,
    });
    showToast('↺ Restored line to raw Mapillary GPS capture points');
  }, [aligningSequence, showToast]);

  // Excluded Streetview Sequences State
  const [excludedSequences, setExcludedSequences] = useState(() => streetviewAlignmentService.getExcludedSequences());
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [manualExcludeInput, setManualExcludeInput] = useState('');

  const handleDeleteAlignment = useCallback(async (sequenceId) => {
    if (!isAdmin) return;
    await streetviewAlignmentService.deleteAlignedSequence(sequenceId);
    setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
    if (aligningSequence?.sequenceId === sequenceId) {
      setAligningSequence(null);
    }
    showToast(`🗑️ Alignment deleted for sequence ${sequenceId.slice(0, 8)}... (reverted to raw)`);
  }, [isAdmin, aligningSequence, showToast]);

  const handleToggleExcludeSequence = useCallback((sequenceId) => {
    if (!isAdmin) return;
    if (streetviewAlignmentService.isSequenceExcluded(sequenceId)) {
      const updated = streetviewAlignmentService.restoreSequence(sequenceId);
      setExcludedSequences(updated);
      setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
      showToast(`👁️ Sequence ${sequenceId.slice(0, 8)}... restored to map`);
    } else {
      const updated = streetviewAlignmentService.excludeSequence(sequenceId);
      setExcludedSequences(updated);
      setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
      if (aligningSequence?.sequenceId === sequenceId) {
        setAligningSequence(null);
      }
      showToast(`🚫 Sequence ${sequenceId.slice(0, 8)}... excluded and removed from map`);
    }
  }, [isAdmin, aligningSequence, showToast]);

  // Automatically calculate route when both Point A and Point B are chosen
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  useEffect(() => {
    if (!routeOrigin || !routeDestination) return;

    let isMounted = true;
    const autoCalc = async () => {
      setIsCalculatingRoute(true);
      try {
        const route = await getRoute(routeOrigin, routeDestination, routingProfile);
        if (isMounted) {
          setRouteData(route);
          setSidebarTab('routing');
          showToast('🚀 Route calculated! Turn-by-turn directions ready.');
        }
      } catch (err) {
        console.warn('Auto route calculation error:', err);
      } finally {
        if (isMounted) {
          setIsCalculatingRoute(false);
        }
      }
    };

    autoCalc();
    return () => {
      isMounted = false;
    };
  }, [routeOrigin, routeDestination, routingProfile, showToast]);

  // Right-click / Touchscreen Long-Press context menu handler
  const lastContextMenuTime = useRef(0);
  const handleMapContextMenu = useCallback((lat, lng, screenX, screenY, sequenceId = null, imageId = null) => {
    lastContextMenuTime.current = Date.now();
    setContextMenu({ lat, lng, x: screenX, y: screenY, sequenceId, imageId });

    // If imageId wasn't already resolved from vector tile, perform quick lookup from Mapillary Graph API
    if (!imageId) {
      const delta = 0.002;
      fetch(
        `https://graph.mapillary.com/images?access_token=MLY|28125741697049683|b57c41e6691fc16e7559d980e08c82c9&fields=id,sequence,geometry&bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}&limit=5`
      )
        .then((r) => r.json())
        .then((data) => {
          if (data?.data?.length > 0) {
            const closest = data.data.reduce((best, curr) => {
              if (!curr.geometry?.coordinates) return best;
              const d = Math.hypot(curr.geometry.coordinates[0] - lng, curr.geometry.coordinates[1] - lat);
              if (!best || d < best.d) return { ...curr, d };
              return best;
            }, null);

            if (closest && closest.d < 0.0015) { // within ~150 meters
              setContextMenu((prev) =>
                prev && prev.lat === lat && prev.lng === lng
                  ? {
                      ...prev,
                      imageId: String(closest.id),
                      sequenceId: prev.sequenceId || (closest.sequence ? String(closest.sequence) : null),
                    }
                  : prev
              );
            }
          }
        })
        .catch((err) => console.warn('Mapillary nearest image key lookup notice:', err));
    }
  }, []);

  // Dismiss context menu on click or Escape key (ignoring synthetic clicks right after long-press)
  useEffect(() => {
    const dismiss = () => {
      if (Date.now() - lastContextMenuTime.current < 350) return;
      setContextMenu(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', dismiss);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Initialize Tourist Spots with instant local cache + background Neon Cloud sync
  const loadTouristSpots = useCallback(() => {
    // 1. Instant local render (offline-first, zero delay)
    const spots = touristSpotsService.getAllSpots();
    setTouristSpots(spots);

    // 2. Fetch local panoramas list from Neon Cloud
    touristSpotsService
      .fetchPanoramasList()
      .then((panos) => {
        if (Array.isArray(panos) && panos.length > 0) {
          setLocalPanoramas(panos);
        }
      })
      .catch(() => {});

    // 3. Background cloud synchronization with Neon PostgreSQL
    touristSpotsService
      .fetchFromCloud()
      .then((cloudSpots) => {
        if (Array.isArray(cloudSpots) && cloudSpots.length > 0) {
          setTouristSpots(cloudSpots);
        }
      })
      .catch(() => {});

    // 4. Background synchronization of aligned streetview sequences from Neon DB
    streetviewAlignmentService
      .syncWithNeon()
      .then(() => {
        setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
      })
      .catch(() => {});
  }, []);

  // Filter spots by Tourist Attraction vs Service/POI, Barangay, and Trail Difficulty
  const displayedSpots = useMemo(() => {
    return touristSpots.filter((s) => {
      const isPoi = (s.spotType || s.type) === 'poi';
      if (spotFilter === 'tourist_spot' && isPoi) return false;
      if (spotFilter === 'poi' && !isPoi) return false;
      if (barangayFilter !== 'all' && s.barangay !== barangayFilter) return false;
      if (difficultyFilter !== 'all' && s.trail_difficulty !== difficultyFilter) return false;
      return true;
    });
  }, [touristSpots, spotFilter, barangayFilter, difficultyFilter]);

  useEffect(() => {
    loadTouristSpots();
  }, [loadTouristSpots]);

  // Helper: check if a tourist spot has a dedicated local 360 panorama (either in Neon Cloud DB, local files, or explicit type)
  const spotHasDedicatedPano = useCallback(
    (spot) => {
      if (!spot) return false;
      const targetId = spot.connected360?.targetId || spot.primary_pano_id;
      // If explicitly marked local or has a dedicated pano_ ID, it is a dedicated panorama
      if (spot.connected360?.type === 'local') return true;
      if (targetId && String(targetId).startsWith('pano_')) return true;
      if (spot.connected360?.imageUrl && !String(spot.connected360.imageUrl).includes('maps.google')) return true;
      if (spot.connected360?.type === 'google' || spot.connected360?.type === 'mapillary') return false;
      if (!targetId) return false;
      if (
        localPanoramas.some((p) => String(p.id) === String(targetId) || String(p.id) === `pano_${targetId}` || `pano_${p.id}` === String(targetId))
      ) {
        return true;
      }
      return false;
    },
    [localPanoramas]
  );

  // Handle selecting a Tourist Spot (POI) from map or sidebar
  const handleSelectTouristSpot = useCallback(
    async (spot) => {
      setActiveTouristSpot(spot);
      setViewerOpen(true);

      const lat = spot.location?.lat ?? spot.lat;
      const lng = spot.location?.lng ?? spot.lng;

      // 1. If landmark has its own dedicated 360 image (uploaded or linked)
      const customPanoId = spot.connected360?.targetId || spot.primary_pano_id;
      const isLocalPano = spotHasDedicatedPano(spot);

      // Dedicated Mapillary pano ID (exclude if it's already a dedicated local panorama or UA gate)
      const isDedicatedPanoId =
        !isLocalPano &&
        customPanoId &&
        String(customPanoId).length >= 10 &&
        /^\d+$/.test(String(customPanoId)) &&
        (String(customPanoId) !== '1532761357806896' || spot.id === 'poi_ua_main_gate');

      if (isLocalPano) {
        setViewerPanoMode('dedicated');
        setStreetViewPos({ lat, lng, id: String(customPanoId || spot.id) });
      } else if (isInsideUACampus(lat, lng) || isDedicatedPanoId) {
        // Area inside UA Campus has no Google Street View vehicle coverage; default directly to Mapillary Campus Trail
        setViewerPanoMode('mapillary');
        const chosenId = String(customPanoId || MAPILLARY_CAMPUS_GATE_IMAGE_ID);
        setMapillaryImageId(chosenId);
        setStreetViewPos({ lat, lng, id: chosenId });
      } else {
        // Default to Google Street View for general road / highway locations
        setViewerPanoMode('google');
        setStreetViewPos({ lat, lng, id: String(customPanoId || spot.id) });
      }

      // 3. Orient the 360 viewer toward the landmark's heading
      if (spot.connected360?.heading !== undefined) {
        const spotHeading = parseFloat(spot.connected360.heading) || 0;
        const spotPitch = parseFloat(spot.connected360.pitch) || 0;
        setViewerHeading(spotHeading);
        setSteerTarget({
          heading: spotHeading,
          pitch: spotPitch,
          key: Date.now(),
        });
      }
    },
    []
  );

  const handleToggleViewerMode = useCallback((mode) => {
    setViewerPanoMode(mode);
  }, []);

  // Steering camera helper
  const handleSteerHeading = useCallback((heading, pitch) => {
    setSteerTarget({
      heading,
      pitch,
      key: Date.now(),
    });
  }, []);

  // Step 2: Batch Sync all locally staged drafts to Neon Cloud
  const handleBatchSyncToNeon = async () => {
    setIsSyncing(true);
    try {
      const result = await touristSpotsService.syncToNeonCloud();
      alert(result.message);
      loadTouristSpots();
    } catch (err) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Delete Tourist Spot
  const handleDeleteSpot = (spotId, e) => {
    e?.stopPropagation();
    if (window.confirm('Delete this location from the system?')) {
      touristSpotsService.deleteSpot(spotId);
      if (activeTouristSpot?.id === spotId) {
        setActiveTouristSpot(null);
      }
      loadTouristSpots();
    }
  };

  // Handle dragging a Tourist Spot / POI marker directly on the 2D map
  const handleSpotLocationChange = useCallback(
    (spotId, newLat, newLng) => {
      const lat = parseFloat(Number(newLat).toFixed(6));
      const lng = parseFloat(Number(newLng).toFixed(6));
      touristSpotsService.updateSpotLocation(spotId, lat, lng);

      setTouristSpots((prev) =>
        prev.map((s) => (s.id === spotId ? { ...s, location: { ...(s.location || {}), lat, lng }, lat, lng } : s))
      );

      if (activeTouristSpot?.id === spotId) {
        setActiveTouristSpot((prev) =>
          prev ? { ...prev, location: { ...(prev.location || {}), lat, lng }, lat, lng } : null
        );
      }

      // Haptic feedback for touch devices
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([30, 20, 30]);
        } catch (_) {}
      }

      const spot = touristSpots.find((s) => s.id === spotId);
      const spotName = spot?.name || 'Landmark';
      showToast(`📍 ${spotName} moved to [${lat.toFixed(5)}, ${lng.toFixed(5)}] — Saved`);
    },
    [activeTouristSpot, touristSpots, showToast]
  );

  // Swap origin and destination
  const handleSwapPoints = useCallback(() => {
    setRouteOrigin(routeDestination);
    setRouteDestination(routeOrigin);
    setRouteData(null);
  }, [routeOrigin, routeDestination]);

  // Handle map click for routing mode
  const handleMapClickForRouting = useCallback((lat, lng) => {
    if (pickingTarget === 'origin') {
      setRouteOrigin([lng, lat]);
      setPickingTarget(null);
      setRoutingMode(false);
      setRouteData(null);
      return;
    }
    if (pickingTarget === 'destination') {
      setRouteDestination([lng, lat]);
      setPickingTarget(null);
      setRoutingMode(false);
      setRouteData(null);
      return;
    }

    // Default sequential picking: Point A first, then Point B
    if (!routeOrigin) {
      setRouteOrigin([lng, lat]);
      setRouteData(null);
    } else if (!routeDestination) {
      setRouteDestination([lng, lat]);
      setRoutingMode(false);
      setRouteData(null);
    } else {
      // Both were already set: reset and start fresh with Point A
      setRouteOrigin([lng, lat]);
      setRouteDestination(null);
      setRouteData(null);
    }
  }, [pickingTarget, routeOrigin, routeDestination]);

  // Handle clicking on the map — seamlessly handles routing and Mapillary features
  const handleMapClick = useCallback(
    async (lat, lng, clickedMapillaryId, isMapillaryClick = false) => {
      if (routingMode || pickingTarget) {
        handleMapClickForRouting(lat, lng);
        return;
      }
      
      // If clicked directly on a Mapillary dot or sequence with a verified 64-bit Mapillary image ID
      const isValidId = clickedMapillaryId && String(clickedMapillaryId).length >= 10 && /^\d+$/.test(String(clickedMapillaryId));
      if (isValidId) {
        setActiveTouristSpot(null);
        setMapillaryImageId(String(clickedMapillaryId));
        setStreetViewPos({ lat, lng, id: String(clickedMapillaryId) });
        setViewerPanoMode('mapillary');
        setViewerOpen(true);
        return;
      }

      // ONLY check nearby streetview coverage if the click was explicitly on a Mapillary feature
      if (isMapillaryClick) {
        const images = await searchNearby(lat, lng);
        setMapillaryImages(images);
        if (images && images.length > 0) {
          setActiveTouristSpot(null);
          setMapillaryImageId(String(images[0].id));
          setStreetViewPos({ lat: images[0].lat, lng: images[0].lng, id: String(images[0].id) });
          setViewerPanoMode('mapillary');
          setViewerOpen(true);
        }
      }
    },
    [routingMode, pickingTarget, handleMapClickForRouting, searchNearby]
  );

  // Resize handle logic
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    resizing.current = true;

    const onMouseMove = (e) => {
      if (!resizing.current) return;
      const percentage = (e.clientX / window.innerWidth) * 100;
      setMapWidth(Math.max(25, Math.min(75, percentage)));
    };

    const onMouseUp = () => {
      resizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // Close viewer and return to 2D map view cleanly
  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    setViewerLayout('split'); // Always restore layout to split
    setMapillaryImageId(null);
    setStreetViewPos(null);
    setActiveTouristSpot(null);
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
  }, []);

  // Gracefully fallback to Street View if custom 360 photo fails or cloud quota is exceeded
  const handleFallbackToMapillary = useCallback(() => {
    showToast('🔄 Switching to Street View...');
    if (activeTouristSpot?.id) {
      touristSpotsService.healSpotToSeed(activeTouristSpot.id);
      loadTouristSpots();
    }
    const lat = activeTouristSpot?.location?.lat ?? activeTouristSpot?.lat;
    const lng = activeTouristSpot?.location?.lng ?? activeTouristSpot?.lng;
    if (lat && lng && isInsideUACampus(lat, lng)) {
      setViewerPanoMode('mapillary');
      setMapillaryImageId(MAPILLARY_CAMPUS_GATE_IMAGE_ID);
      setStreetViewPos({ lat, lng, id: MAPILLARY_CAMPUS_GATE_IMAGE_ID });
    } else if (lat && lng) {
      setViewerPanoMode('google');
      setStreetViewPos({ lat, lng, id: activeTouristSpot?.id || 'streetview' });
    } else {
      setViewerPanoMode('google');
    }
  }, [activeTouristSpot, showToast, loadTouristSpots]);

  // Configure custom Neon Cloud Database URL (Admin)
  const handleConfigureNeonUrl = useCallback(() => {
    const current = touristSpotsService.getNeonUrl();
    const entered = window.prompt(
      'Configure Neon PostgreSQL Cloud Connection URL:\n\n(If your previous Neon database hit its free monthly quota, paste a new free connection string from console.neon.tech here):',
      current || ''
    );
    if (entered !== null) {
      touristSpotsService.setNeonUrl(entered.trim());
      showToast('☁️ Neon Cloud Database URL updated!');
      loadTouristSpots();
    }
  }, [loadTouristSpots, showToast]);

  const handleRouteCalculated = useCallback((route) => {
    setRouteData(route);
    setRoutingMode(false);
  }, []);

  const handleClearRoute = useCallback(() => {
    setRouteOrigin(null);
    setRouteDestination(null);
    setRouteData(null);
    setRoutingMode(false);
  }, []);

  const handleStartNavigation = useCallback((route) => {
    setRouteData(route);
    setIsNavigating(true);
  }, []);

  const handleExitNavigation = useCallback(() => {
    setIsNavigating(false);
  }, []);

  // Handle switching between Tourist and Admin roles (password protected)
  const handleRoleToggle = useCallback(() => {
    if (isAdmin) {
      setIsAdmin(false);
      sessionStorage.removeItem('lagangilang_admin_authenticated');
      showToast('🌴 Tourist Explorer active — Explore map & navigate 360 street views');
    } else {
      setIsChangePasswordMode(false);
      setShowAdminPasswordModal(true);
    }
  }, [isAdmin, showToast]);

  const handleAdminAuthSuccess = useCallback(() => {
    setIsAdmin(true);
    sessionStorage.setItem('lagangilang_admin_authenticated', 'true');
    setShowAdminPasswordModal(false);
    showToast('🛡️ Admin Panel unlocked — Marker dragging & location marking enabled');
  }, [showToast]);

  const stagedCount = touristSpots.filter((s) => s.sync_status === 'staged_local').length;

  if (isNavigating && routeData && !isNavMinimized) {
    return (
      <NavigationView
        routeData={routeData}
        onExit={handleExitNavigation}
        theme={mapTheme}
        isMinimized={false}
        onToggleMinimize={() => setIsNavMinimized(true)}
      />
    );
  }

  return (
    <div className="app-container">
      {/* ===== Map Panel ===== */}
      <div
        className={`panel-map ${!viewerOpen ? 'expanded' : ''} ${viewerOpen && viewerLayout === 'split' ? 'split-active' : ''} ${viewerOpen && viewerLayout === 'fullscreen' ? 'fullscreen-collapsed' : ''} ${isAdmin ? 'admin-mode' : ''}`}
        style={viewerOpen && viewerLayout === 'split' ? { flex: `0 0 ${mapWidth}%` } : {}}
      >
        {/* Minimized Floating Turn-by-Turn Navigation HUD over 2D Map */}
        {isNavigating && routeData && isNavMinimized && (
          <NavigationView
            routeData={routeData}
            onExit={handleExitNavigation}
            theme={mapTheme}
            isMinimized={true}
            onToggleMinimize={() => setIsNavMinimized(false)}
          />
        )}
        {/* 2D MapView (Base layer rendered first in DOM order) */}
        <MapView
          theme={mapTheme}
          viewerOpen={viewerOpen}
          onMapClick={handleMapClick}
          onMapContextMenu={handleMapContextMenu}
          viewerHeading={viewerHeading}
          streetViewPos={streetViewPos}
          touristSpots={touristSpots}
          activeTouristSpotId={activeTouristSpot?.id}
          onSelectTouristSpot={handleSelectTouristSpot}
          onSpotLocationChange={handleSpotLocationChange}
          showCoverageGaps={showCoverageGaps}
          showCustomOSM={showCustomOSM}
          mapCenter={
            streetViewPos
              ? [streetViewPos.lng, streetViewPos.lat]
              : (mapCenterPos || [120.738083, 17.60825]) // Lagangilang, Abra
          }
          mapZoom={15}
          routeGeoJSON={routeData?.geometry || null}
          routeOrigin={routeOrigin}
          routeDestination={routeDestination}
          routingMode={routingMode || !!pickingTarget}
          pickingMode={pickingTarget}
          isAdmin={isAdmin}
          isDraggable={isAdmin && pinsDraggable}
          aligningSequence={isAdmin ? aligningSequence : null}
          onUpdateAligningSequence={setAligningSequence}
          alignedGeoJSON={alignedGeoJSON}
          isSelectingAlignmentTarget={isAdmin && isSelectingAlignmentTarget}
          onSelectSequenceForAlignment={handleSelectSequenceForAlignment}
          showMapillaryStreetview={showMapillaryStreetview}
          showMapillaryDots={showMapillaryDots}
          showMapillaryLines={showMapillaryLines}
          excludedSequences={excludedSequences}
        />

        {/* Map top controls */}
        <div className="map-overlay-top">
          {/* Horizontally scrollable/dynamic action bar across all aspect ratios */}
          <div className="nav-scroll-container">
            {/* Role Indicator Badge */}
            <div
              className={`role-indicator ${isAdmin ? 'admin' : 'tourist'}`}
              onClick={handleRoleToggle}
              title={isAdmin ? 'Switch to Tourist Explorer' : 'Switch to Admin Panel (Password Required)'}
            >
              <span className="role-indicator-dot" />
              <span>{isAdmin ? '🛡️ Admin' : '🌴 Tourist'}</span>
              <span className="btn-label-text">{isAdmin ? ' Panel' : ' Explorer'}</span>
            </div>

            {/* Live Weather Forecast & Trail Advisory Pill */}
            <WeatherWidget isCompact={viewerOpen && viewerLayout === 'split'} />

            {/* Emergency Hotlines & Safety Button */}
            <button
              className="btn btn-secondary btn-emergency-top"
              onClick={() => setShowEmergencyModal(true)}
              title="Official Lagangilang LGU Emergency Hotlines & Trail Safety Guidelines"
              style={{
                fontSize: '0.8rem',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                background: 'rgba(239, 68, 68, 0.18)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
              }}
            >
              <span>🚨</span>
              <span className="btn-label-text">Hotlines</span>
            </button>

            {/* Offline Guide & Data Saver Button */}
            <button
              className="btn btn-secondary btn-offline-top"
              onClick={() => setShowOfflineModal(true)}
              title="Download maps & trail guide for zero-signal areas / Low-Data Mode"
              style={{
                fontSize: '0.8rem',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#6ee7b7',
              }}
            >
              <span>📥</span>
              <span className="btn-label-text">Offline</span>
            </button>

            {/* Theme Selector Dropdown */}
            <div className="theme-dropdown-custom" title="Map Theme">
              <span className="theme-dropdown-icon">
                {mapTheme === 'dark' ? '🌙' : mapTheme === 'light' ? '☀️' : mapTheme === 'beige' ? '📜' : '🛰️'}
              </span>
              <select
                id="map-theme-dropdown"
                className="theme-dropdown-select"
                value={mapTheme}
                onChange={(e) => {
                  const t = e.target.value;
                  setMapTheme(t);
                  localStorage.setItem('lagangilang_map_theme', t);
                  showToast(`Map theme: ${t.charAt(0).toUpperCase() + t.slice(1)}`);
                }}
                aria-label="Map theme dropdown"
              >
                <option value="light">☀️ Light</option>
                <option value="dark">🌙 Dark</option>
                <option value="beige">📜 Beige</option>
                <option value="satellite">🛰️ Satellite</option>
              </select>
              <span className="theme-dropdown-chevron">▼</span>
            </div>

            {/* Route Button (Tourist prominent) */}
            <button
              className="btn btn-primary"
              onClick={() => {
                setSidebarTab('routing');
                setSidebarOpen(true);
              }}
              style={{
                fontSize: '0.8rem',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                color: '#fff',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>🧭</span>
              <span className="btn-label-text">Route</span>
            </button>

            {/* Admin-only controls */}
            {isAdmin && (
              <>
                <div className="controls-separator" />

                {/* Toggle Mapillary Streetview (Green lines & dots) - Admin only */}
                <button
                  className={`btn ${showMapillaryStreetview ? 'btn-secondary' : 'btn-ghost'}`}
                  onClick={() => {
                    const next = !showMapillaryStreetview;
                    setShowMapillaryStreetview(next);
                    setShowMapillaryDots(next);
                    setShowMapillaryLines(next);
                    showToast(
                      next
                        ? '🟢 Mapillary streetview (lines & dots) visible'
                        : '⚪ Mapillary streetview hidden (cyan line remains visible)'
                    );
                  }}
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  title={
                    showMapillaryStreetview
                      ? 'Hide raw Mapillary streetview (green lines & dots)'
                      : 'Show raw Mapillary streetview (green lines & dots)'
                  }
                >
                  <span>{showMapillaryStreetview ? '🟢' : '⚪'}</span>
                  <span className="btn-label-text">
                    {showMapillaryStreetview ? 'Street: ON' : 'Street: OFF'}
                  </span>
                </button>
                {/* Bend / Align Streetview Line Button (Admin only) */}
                <button
                  className={`btn ${aligningSequence || isSelectingAlignmentTarget ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    if (aligningSequence) {
                      setAligningSequence(null);
                      setIsSelectingAlignmentTarget(false);
                    } else if (isSelectingAlignmentTarget) {
                      setIsSelectingAlignmentTarget(false);
                      showToast('Line selection cancelled');
                    } else {
                      setIsSelectingAlignmentTarget(true);
                      showToast('🎯 Click directly on the green streetview line you want to bend & re-align!');
                    }
                  }}
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    background: aligningSequence || isSelectingAlignmentTarget
                      ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                      : undefined,
                  }}
                  title="Bend and re-align Mapillary streetview lines onto road curves (Admin only)"
                >
                  <span>📐</span>
                  <span className="btn-label-text">
                    {aligningSequence ? 'Exit Align' : isSelectingAlignmentTarget ? 'Cancel' : 'Align Line'}
                  </span>
                </button>
                {/* Custom OSM Overlay Toggle */}
                <button
                  className={`btn btn-sm ${showCustomOSM ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setShowCustomOSM(!showCustomOSM)}
                  title="Toggle Custom OSM Map Overlay"
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: showCustomOSM
                      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                      : 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>🗺️</span>
                  <span className="btn-label-text">Custom Map</span>
                </button>

                {/* Add Tourist Spot Button */}
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setEditingSpot(null);
                    setShowSpotModal(true);
                  }}
                  title="Add Location (POI or Attraction) to System"
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    background: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
                    color: '#1a1a2e',
                    fontWeight: 700,
                    border: 'none',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>⭐</span>
                  <span className="btn-label-text">+ Add Spot</span>
                </button>

                {/* Pin Repositioning Lock / Unlock Button */}
                <button
                  className={`btn btn-sm ${pinsDraggable ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    const nextState = !pinsDraggable;
                    setPinsDraggable(nextState);
                    showToast(
                      nextState
                        ? '🔓 Pin repositioning unlocked: Drag landmarks or POIs to adjust coordinates.'
                        : '🔒 Pin repositioning locked: Marker positions are secured.'
                    );
                  }}
                  title={
                    pinsDraggable
                      ? 'Pins are UNLOCKED for dragging. Click to lock against movement.'
                      : 'Pins are LOCKED against accidental movement. Click to unlock repositioning.'
                  }
                  style={{
                    fontSize: '0.8rem',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    background: pinsDraggable
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'rgba(0,0,0,0.6)',
                    border: pinsDraggable
                      ? '1px solid #34d399'
                      : '1px solid rgba(255,255,255,0.15)',
                    color: '#ffffff',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <span>{pinsDraggable ? '🔓' : '🔒'}</span>
                  <span className="btn-label-text">{pinsDraggable ? 'Reposition ON' : 'Pins Locked'}</span>
                </button>

                {/* Online/Offline indicator & DB configuration */}
                <div
                  onClick={handleConfigureNeonUrl}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: isOnline ? '#10b981' : '#f59e0b',
                    border: `1px solid ${isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.4)'}`,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  title={isOnline ? 'Online • Neon PostgreSQL connected (Click to change DB URL)' : 'Offline • Field staging buffer active (Click to change DB URL)'}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isOnline ? '#10b981' : '#f59e0b',
                      boxShadow: `0 0 6px ${isOnline ? '#10b981' : '#f59e0b'}`,
                    }}
                  />
                  <span>{isOnline ? 'Online ⚙️' : 'Offline ⚙️'}</span>
                </div>

                {/* Staged Drafts Indicator & Queue Opener (Always accessible for Admin) */}
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSidebarTab('staging');
                    setSidebarOpen(true);
                  }}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    border: stagedCount > 0 ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.2)',
                    color: stagedCount > 0 ? '#fbbf24' : '#e2e8f0',
                    background: stagedCount > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(0,0,0,0.5)',
                    animation: stagedCount > 0 ? 'pulse 2s infinite' : 'none',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  title={stagedCount > 0 ? `${stagedCount} locally staged draft(s) pending sync` : 'Open Staging Queue'}
                >
                  🟡 {stagedCount > 0 ? `${stagedCount} Staged` : 'Staging'}
                </button>

                {/* Excluded Sequences Manager Button */}
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowExcludedModal(true)}
                  title="Manage excluded streetview sequences"
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    border: excludedSequences.length > 0 ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.2)',
                    color: excludedSequences.length > 0 ? '#fca5a5' : '#cbd5e1',
                    background: excludedSequences.length > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <span>🚫 Excluded</span>
                  {excludedSequences.length > 0 && (
                    <span style={{
                      background: '#ef4444',
                      color: '#fff',
                      borderRadius: 'var(--radius-full)',
                      padding: '1px 6px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                    }}>
                      {excludedSequences.length}
                    </span>
                  )}
                </button>

                {/* Change Admin Password Button */}
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsChangePasswordMode(true);
                    setShowAdminPasswordModal(true);
                  }}
                  title="Change Admin Password"
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#cbd5e1',
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <span>🔑 Password</span>
                </button>
              </>
            )}
          </div>

          {/* Sidebar toggle - Guaranteed visible & pinned on the far right across all aspect ratios */}
          <button
            className="btn btn-secondary btn-icon nav-hamburger-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Explore Tourist Spots, Staging & Route Planner"
            aria-label="Toggle navigation drawer"
          >
            ☰
          </button>
        </div>

        {/* Map Location Picking Banner */}
        {(routingMode || pickingTarget) && (
          <div className="map-picking-banner">
            <div className="map-picking-banner-content">
              <span>
                {pickingTarget === 'origin'
                  ? '📍 Click anywhere on the map to set Start (Point A)'
                  : pickingTarget === 'destination'
                  ? '🏁 Click anywhere on the map to set Destination (Point B)'
                  : !routeOrigin
                  ? '📍 Click on the map to set Start (Point A)'
                  : '🏁 Point A set! Click on the map to set Destination (Point B)'}
              </span>
              <button
                className="btn-cancel-pick"
                onClick={() => {
                  setRoutingMode(false);
                  setPickingTarget(null);
                }}
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        )}

        {/* Floating instruction banner when selecting line to align */}
        {isSelectingAlignmentTarget && (
          <div className="alignment-selection-banner glass-panel">
            <span>🎯 Click directly on the streetview line or trail you want to bend &amp; re-align</span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setIsSelectingAlignmentTarget(false)}
            >
              ✕ Cancel
            </button>
          </div>
        )}

        {/* Floating Streetview Line Aligner Toolbar (Admin Only) */}
        {isAdmin && aligningSequence && (
          <StreetviewLineAligner
            aligningSequence={aligningSequence}
            onSave={handleSaveAlignment}
            onResetOriginal={handleResetAlignmentOriginal}
            onCancel={() => setAligningSequence(null)}
            onDeleteAlignment={handleDeleteAlignment}
            onExcludeSequence={handleToggleExcludeSequence}
            isSaving={isSavingAlignment}
            showMapillaryStreetview={showMapillaryStreetview}
            showMapillaryDots={showMapillaryDots}
            showMapillaryLines={showMapillaryLines}
            onToggleStreetview={() => {
              const next = !showMapillaryStreetview;
              setShowMapillaryStreetview(next);
              setShowMapillaryDots(next);
              setShowMapillaryLines(next);
            }}
            onToggleDots={() => setShowMapillaryDots(!showMapillaryDots)}
            onToggleLines={() => setShowMapillaryLines(!showMapillaryLines)}
          />
        )}

        {/* Resize handle */}
        {viewerOpen && (
          <div
            className={`resize-handle ${resizing.current ? 'active' : ''}`}
            onMouseDown={handleResizeStart}
          />
        )}

        {/* Sidebar - Tabs: Tourist Spots, Staging Queue, Routing */}
        <div className={`sidebar glass-panel ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-tabs-group" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                className={`sidebar-tab-btn ${sidebarTab === 'spots' ? 'active' : ''}`}
                onClick={() => setSidebarTab('spots')}
                style={{
                  background: sidebarTab === 'spots' ? 'var(--accent-primary)' : 'transparent',
                  color: sidebarTab === 'spots' ? '#fff' : 'var(--text-secondary)',
                  border: sidebarTab === 'spots' ? 'none' : '1px solid var(--border-subtle)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                ⭐ Spots ({touristSpots.length})
              </button>
              <button
                className={`sidebar-tab-btn ${sidebarTab === 'tools' ? 'active' : ''}`}
                onClick={() => setSidebarTab('tools')}
                style={{
                  background: sidebarTab === 'tools' ? 'var(--accent-primary)' : 'transparent',
                  color: sidebarTab === 'tools' ? '#fff' : 'var(--text-secondary)',
                  border: sidebarTab === 'tools' ? 'none' : '1px solid var(--border-subtle)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                🛠️ Tools
              </button>
              {isAdmin && (
                <button
                  className={`sidebar-tab-btn tab-staging ${sidebarTab === 'staging' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('staging')}
                  style={{
                    background: sidebarTab === 'staging' ? '#f59e0b' : 'rgba(245,158,11,0.2)',
                    color: sidebarTab === 'staging' ? '#1a1a2e' : '#fbbf24',
                    border: '1px solid rgba(245,158,11,0.4)',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title="Staging Queue (Offline field captures)"
                >
                  🟡 Staging {stagedCount > 0 ? `(${stagedCount})` : ''}
                </button>
              )}
              <button
                className={`sidebar-tab-btn ${sidebarTab === 'routing' ? 'active' : ''}`}
                onClick={() => setSidebarTab('routing')}
                style={{
                  background: sidebarTab === 'routing' ? 'var(--accent-primary)' : 'transparent',
                  color: sidebarTab === 'routing' ? '#fff' : 'var(--text-secondary)',
                  border: sidebarTab === 'routing' ? 'none' : '1px solid var(--border-subtle)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                🧭 Routing
              </button>
            </div>

            <button
              className="btn btn-ghost sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              title="Close drawer"
              aria-label="Close drawer"
            >
              ✕
            </button>
          </div>

          <div className="sidebar-body">
            {/* Tab 1: Tourist Spots & POIs */}
          {sidebarTab === 'spots' && (
            <div>
              {/* Tourist Welcome */}
              {!isAdmin && (
                <div className="tourist-welcome">
                  <span className="tourist-welcome-icon">🌴</span>
                  <span>
                    Welcome to <strong>Lagangilang, Abra!</strong> Explore tourist spots below.
                    Tap any spot to view in 360° or tap <strong>🧭 Route Here</strong> to get directions.
                  </span>
                </div>
              )}

              {/* Filters: Category & Barangay */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'tourist_spot', label: '🌴 Tourist Spots' },
                    { id: 'poi', label: '🏪 Services / POI' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSpotFilter(f.id)}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: spotFilter === f.id ? 'var(--accent-primary)' : 'rgba(255,255,255,0.06)',
                        color: spotFilter === f.id ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Barangay:</span>
                  <select
                    value={barangayFilter}
                    onChange={(e) => setBarangayFilter(e.target.value)}
                    className="input-field"
                    style={{ flex: 1, fontSize: '0.75rem', padding: '3px 8px' }}
                  >
                    <option value="all">All Barangays (17 Total)</option>
                    {LAGANGILANG_BARANGAYS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Trail Difficulty Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Difficulty:</span>
                  <select
                    value={difficultyFilter}
                    onChange={(e) => setDifficultyFilter(e.target.value)}
                    className="input-field"
                    style={{ flex: 1, fontSize: '0.75rem', padding: '3px 8px' }}
                  >
                    <option value="all">All Trail Difficulties</option>
                    <option value="Easy">🟢 Easy (Gentle / Accessible)</option>
                    <option value="Moderate">🟠 Moderate (Gravel & Riverbank)</option>
                    <option value="Challenging">🔴 Challenging (Caves & Rocks)</option>
                  </select>
                </div>
              </div>

              {/* Spots List */}
              <div className="pano-list">
                {displayedSpots.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '16px 0' }}>
                    No spots found for this filter.
                  </p>
                ) : (
                  displayedSpots.map((spot) => {
                    const isPoi = (spot.spotType || spot.type) === 'poi';
                    return (
                      <div
                        key={spot.id}
                        className={`pano-list-item ${activeTouristSpot?.id === spot.id ? 'active' : ''}`}
                        onClick={() => handleSelectTouristSpot(spot)}
                        style={{ flexDirection: 'column', alignItems: 'stretch' }}
                      >
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          <div style={{ width: '60px', height: '60px', minWidth: '60px', maxWidth: '60px', flexShrink: 0 }}>
                            {spot.isPseudoImage ? (
                              <PseudoImage
                                title={spot.name}
                                category={spot.category}
                                categoryIcon={spot.categoryIcon}
                                theme={spot.pseudoTheme || (isPoi ? 'cyan' : 'indigo')}
                                height="60px"
                                width="60px"
                                style={{ borderRadius: 'var(--radius-sm)' }}
                              />
                            ) : spot.image ? (
                              <img
                                src={spot.image}
                                alt={spot.name}
                                className="pano-thumb"
                                style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '60px',
                                  height: '60px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: isPoi ? 'rgba(6, 214, 160, 0.2)' : 'rgba(255, 215, 0, 0.2)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '1.5rem',
                                }}
                              >
                                {spot.categoryIcon || (isPoi ? '🏪' : '⭐')}
                              </div>
                            )}
                          </div>

                          <div className="pano-info" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h4 style={{ fontSize: '0.88rem', margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {spot.name}
                              </h4>
                              {spot.sync_status === 'staged_local' && (
                                <span style={{ fontSize: '0.65rem', color: '#fbbf24', marginLeft: '4px', flexShrink: 0 }}>🟡 Draft</span>
                              )}
                            </div>
                            <p style={{ fontSize: '0.72rem', color: isPoi ? '#34d399' : '#ffd700', margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {spot.categoryIcon || (isPoi ? '🏪' : '⭐')} {spot.category} • Brgy. {spot.barangay}
                            </p>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {spot.location?.address}
                            </p>
                          </div>
                        </div>

                        {/* Actions Row */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '0.7rem', padding: '2px 8px', color: '#3b82f6' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRouteToSpot(spot);
                            }}
                          >
                            🧭 Route Here
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                className="btn btn-ghost"
                                style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingSpot(spot);
                                  setShowSpotModal(true);
                                }}
                              >
                                ✎ Edit
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ fontSize: '0.7rem', padding: '2px 6px', color: '#ef4444' }}
                                onClick={(e) => handleDeleteSpot(spot.id, e)}
                              >
                                🗑️ Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Tab: Tools (Tablet & Mobile Optimized Quick-Access Hub) */}
          {sidebarTab === 'tools' && (
            <div className="sidebar-body sidebar-tools-container" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  User Role & Permissions
                </span>
                <button
                  className={`btn ${isAdmin ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={handleRoleToggle}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    width: '100%',
                  }}
                >
                  <span>{isAdmin ? '🛡️ Admin Panel Active' : '🌴 Tourist Explorer Active'}</span>
                  <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>
                    {isAdmin ? 'Switch to Tourist' : 'Switch to Admin (PW)'}
                  </span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Map Theme Style
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'light', label: '☀️ Light' },
                    { id: 'dark', label: '🌙 Dark' },
                    { id: 'beige', label: '📜 Beige' },
                    { id: 'satellite', label: '🛰️ Satellite' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      className={`btn ${mapTheme === t.id ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setMapTheme(t.id);
                        localStorage.setItem('lagangilang_map_theme', t.id);
                        showToast(`Map theme: ${t.label}`);
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        fontWeight: mapTheme === t.id ? 700 : 500,
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Navigation & Planner
                </span>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setSidebarTab('routing');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                  }}
                >
                  🧭 Open Route Planner
                </button>
              </div>

              {/* Emergency & Municipal Services Hub */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f87171' }}>
                  Safety & Emergency Services
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowEmergencyModal(true);
                    setSidebarOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#fca5a5',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🚨</span>
                    <span>Emergency Hotlines & Guidelines</span>
                  </span>
                  <span>➔</span>
                </button>
              </div>

              {/* Offline Maps & Data Saver Mode */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#34d399' }}>
                  Offline Access & Data Saver
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowOfflineModal(true);
                    setSidebarOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#6ee7b7',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📥</span>
                    <span>Download Offline Guide & Low-Data</span>
                  </span>
                  <span>➔</span>
                </button>
              </div>

              {/* Admin Tools Section */}
              {isAdmin ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f59e0b' }}>
                    🛡️ Admin Controls
                  </span>

                  <button
                    className={`btn ${showMapillaryStreetview ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => {
                      const next = !showMapillaryStreetview;
                      setShowMapillaryStreetview(next);
                      setShowMapillaryDots(next);
                      setShowMapillaryLines(next);
                      showToast(next ? '🟢 Mapillary streetview visible' : '⚪ Mapillary streetview hidden');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>Raw Streetview Lines & Dots</span>
                    <span>{showMapillaryStreetview ? '🟢 ON' : '⚪ OFF'}</span>
                  </button>

                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setEditingSpot(null);
                      setShowSpotModal(true);
                      setSidebarOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '11px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
                      color: '#1a1a2e',
                      border: 'none',
                    }}
                  >
                    ⭐ + Add New Landmark / Spot
                  </button>

                  <button
                    className={`btn ${pinsDraggable ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      const next = !pinsDraggable;
                      setPinsDraggable(next);
                      showToast(next ? '🔓 Pin repositioning unlocked' : '🔒 Pins locked');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>Drag & Reposition Pins</span>
                    <span>{pinsDraggable ? '🔓 Unlocked' : '🔒 Locked'}</span>
                  </button>

                  <button
                    className={`btn ${showCustomOSM ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setShowCustomOSM(!showCustomOSM)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>🗺️ Custom OSM Overlay</span>
                    <span>{showCustomOSM ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    className={`btn ${aligningSequence || isSelectingAlignmentTarget ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setSidebarOpen(false);
                      if (aligningSequence) {
                        setAligningSequence(null);
                        setIsSelectingAlignmentTarget(false);
                      } else if (isSelectingAlignmentTarget) {
                        setIsSelectingAlignmentTarget(false);
                      } else {
                        setIsSelectingAlignmentTarget(true);
                        showToast('🎯 Click directly on the green streetview line you want to bend & re-align!');
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>📐 Bend & Align Streetview Line</span>
                    <span>{aligningSequence ? 'Exit' : isSelectingAlignmentTarget ? 'Cancel' : 'Select'}</span>
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowExcludedModal(true);
                      setSidebarOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>🚫 Excluded Sequences Manager</span>
                    {excludedSequences.length > 0 && (
                      <span style={{
                        background: '#ef4444',
                        color: '#fff',
                        borderRadius: 'var(--radius-full)',
                        padding: '1px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}>
                        {excludedSequences.length}
                      </span>
                    )}
                  </button>

                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setIsChangePasswordMode(true);
                      setShowAdminPasswordModal(true);
                      setSidebarOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>🔑 Change Admin Password</span>
                    <span>Edit</span>
                  </button>

                  <div
                    onClick={handleConfigureNeonUrl}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(0,0,0,0.5)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: isOnline ? '#10b981' : '#f59e0b',
                      cursor: 'pointer',
                      border: `1px solid ${isOnline ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.4)'}`,
                    }}
                  >
                    <span>Cloud Database</span>
                    <span>{isOnline ? '🟢 Connected ⚙️' : '🟡 Offline Buffer ⚙️'}</span>
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginTop: '6px',
                }}>
                  <span style={{ fontWeight: 600, color: '#93c5fd' }}>💡 Want to edit or add landmarks?</span>
                  <span>Tap <strong>Switch to Admin</strong> above to enter your admin password and unlock pin repositioning, streetview alignment, and custom spot creation.</span>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: 2-Step Offline Staging Queue (Admin) */}
          {isAdmin && sidebarTab === 'staging' && (
            <div>
              <div
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  marginBottom: '12px',
                }}
              >
                <h4 style={{ color: '#fbbf24', fontSize: '0.85rem', margin: '0 0 4px 0' }}>
                  2-Step Field Staging Pipeline
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                  <strong>Step 1:</strong> Captured data is staged in browser storage while offline in Lagangilang trails.
                  <br />
                  <strong>Step 2:</strong> Once verified on the map, push to Neon PostgreSQL.
                </p>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleBatchSyncToNeon}
                  disabled={isSyncing || stagedCount === 0}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    fontSize: '0.85rem',
                  }}
                >
                  {isSyncing ? 'Syncing to Neon...' : `🚀 Sync All ${stagedCount} Drafts to Neon`}
                </button>
              </div>

              {stagedCount === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '16px 0' }}>
                  All tourist spots are synced to the cloud!
                </p>
              ) : (
                <div className="pano-list">
                  {touristSpots
                    .filter((s) => s.sync_status === 'staged_local')
                    .map((spot) => (
                      <div
                        key={spot.id}
                        className="pano-list-item"
                        style={{ flexDirection: 'column', alignItems: 'stretch' }}
                        onClick={() => handleSelectTouristSpot(spot)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <h4 style={{ fontSize: '0.85rem', margin: 0 }}>{spot.name}</h4>
                          <span style={{ fontSize: '0.65rem', color: '#fbbf24' }}>🟡 Local Draft</span>
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '4px 0' }}>
                          {spot.location?.address}
                        </p>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              touristSpotsService.syncToNeonCloud(spot.id).then((r) => {
                                alert(r.message);
                                loadTouristSpots();
                              });
                            }}
                          >
                            Sync Single
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Route Planner */}
          {sidebarTab === 'routing' && (
            <RoutePlanner
              routeOrigin={routeOrigin}
              routeDestination={routeDestination}
              routeData={routeData}
              routingProfile={routingProfile}
              routingMode={routingMode}
              pickingTarget={pickingTarget}
              isNavigating={isNavigating}
              isAdmin={isAdmin}
              isLocating={isLocating}
              touristSpots={touristSpots}
              userLocation={userLocation}
              onSetRoutingMode={setRoutingMode}
              onSetPickingTarget={setPickingTarget}
              onSetProfile={setRoutingProfile}
              onClearRoute={handleClearRoute}
              onRouteCalculated={handleRouteCalculated}
              onStartNavigation={handleStartNavigation}
              onSetOrigin={setRouteOrigin}
              onSetDestination={setRouteDestination}
              onUseMyLocation={handleUseMyLocation}
              onSwapPoints={handleSwapPoints}
            />
          )}

          {/* Floating Tourist Spot Card on Map (when 360 viewer is closed) */}
          {!viewerOpen && activeTouristSpot && (
            <TouristSpotStreetViewCard
              spot={activeTouristSpot}
              onClose={() => setActiveTouristSpot(null)}
              onNavigateTo360={handleSelectTouristSpot}
              onSteerHeading={handleSteerHeading}
              isViewerOpen={false}
              isAdmin={isAdmin}
              viewerPanoMode={viewerPanoMode}
              onToggleViewerMode={handleToggleViewerMode}
              hasDedicatedPano={spotHasDedicatedPano(activeTouristSpot)}
              onEdit={(s) => {
                setEditingSpot(s);
                setShowSpotModal(true);
              }}
              onDelete={(id) => {
                handleDeleteSpot(id);
              }}
              onRoute={handleRouteToSpot}
            />
          )}
          </div>
        </div>
      </div>

      {/* ===== 360 Viewer Panel ===== */}
      <div
        className={`panel-viewer ${!viewerOpen ? 'hidden' : ''} ${viewerOpen && viewerLayout === 'fullscreen' ? 'fullscreen-viewer' : ''}`}
        style={viewerOpen && viewerLayout === 'split' ? { flex: `0 0 ${100 - mapWidth}%` } : {}}
      >
        {viewerOpen && (
          <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1, minHeight: 0 }}>
            {/* Floating Tourist Spot Card */}
            {activeTouristSpot && (
              <TouristSpotStreetViewCard
                spot={activeTouristSpot}
                onClose={() => setActiveTouristSpot(null)}
                onNavigateTo360={handleSelectTouristSpot}
                onSteerHeading={handleSteerHeading}
                isViewerOpen={viewerOpen}
                isAdmin={isAdmin}
                viewerPanoMode={viewerPanoMode}
                onToggleViewerMode={handleToggleViewerMode}
                hasDedicatedPano={spotHasDedicatedPano(activeTouristSpot)}
                onEdit={(s) => {
                  setEditingSpot(s);
                  setShowSpotModal(true);
                }}
                onDelete={(id) => {
                  handleDeleteSpot(id);
                }}
                onRoute={handleRouteToSpot}
              />
            )}

            {/* Bottom-Left 3-Engine Switcher Bar (only when no tourist card is open, ensuring clean layout) */}
            {!activeTouristSpot && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '20px',
                  left: '16px',
                  zIndex: 35,
                  display: 'flex',
                  gap: '4px',
                  padding: '4px',
                  background: 'rgba(15, 23, 42, 0.92)',
                  borderRadius: 'var(--radius-full, 9999px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                  maxWidth: 'calc(100% - 32px)',
                  overflowX: 'auto',
                  pointerEvents: 'auto',
                  animation: 'fadeInUp 0.25s ease-out',
                }}
              >
                <button
                  onClick={() => setViewerPanoMode('google')}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-full, 9999px)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap',
                    background:
                      viewerPanoMode === 'google'
                        ? 'linear-gradient(135deg, #05cb63 0%, #047857 100%)'
                        : 'transparent',
                    color: viewerPanoMode === 'google' ? '#ffffff' : '#94a3b8',
                    boxShadow: viewerPanoMode === 'google' ? '0 2px 8px rgba(5, 203, 99, 0.4)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title="View road-level Google Street View"
                >
                  <span>🌐</span>
                  <span>Google Street View</span>
                </button>

                <button
                  onClick={() => {
                    setViewerPanoMode('mapillary');
                    if (!mapillaryImageId) setMapillaryImageId(MAPILLARY_CAMPUS_GATE_IMAGE_ID);
                  }}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-full, 9999px)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap',
                    background:
                      viewerPanoMode === 'mapillary'
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : 'transparent',
                    color: viewerPanoMode === 'mapillary' ? '#ffffff' : '#94a3b8',
                    boxShadow: viewerPanoMode === 'mapillary' ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  title="View Mapillary sequence lines & UA campus trails"
                >
                  <span>🚗</span>
                  <span>Mapillary Campus Trail</span>
                </button>
              </div>
            )}

            {/* 360 Viewer: Dedicated Uploaded Panorama (Pannellum), Mapillary or Google Street View */}
            {activeTouristSpot && spotHasDedicatedPano(activeTouristSpot) && viewerPanoMode === 'dedicated' ? (
              <PanoramaViewer
                panorama={{
                  id: activeTouristSpot.connected360?.targetId || activeTouristSpot.primary_pano_id || activeTouristSpot.id,
                  filename: `${activeTouristSpot.connected360?.targetId || activeTouristSpot.primary_pano_id || activeTouristSpot.id}.jpg`,
                  imageUrl:
                    activeTouristSpot.connected360?.imageUrl ||
                    activeTouristSpot.image ||
                    `${API_BASE}/panoramas/${activeTouristSpot.connected360?.targetId || activeTouristSpot.primary_pano_id}.jpg`,
                  heading: activeTouristSpot.connected360?.heading || 0,
                  pitch: activeTouristSpot.connected360?.pitch || 0,
                  lat: activeTouristSpot.location?.lat ?? activeTouristSpot.lat,
                  lng: activeTouristSpot.location?.lng ?? activeTouristSpot.lng,
                  label: activeTouristSpot.name,
                }}
                panoramas={localPanoramas}
                viewerHeading={viewerHeading}
                onHeadingChange={setViewerHeading}
                steerTarget={steerTarget}
                onCloseViewer={handleCloseViewer}
                onFallbackToMapillary={handleFallbackToMapillary}
              />
            ) : viewerPanoMode === 'mapillary' ? (
              <MapillaryViewer
                imageId={mapillaryImageId || MAPILLARY_CAMPUS_GATE_IMAGE_ID}
                excludedSequences={excludedSequences}
                onPositionChange={(pos) => {
                  setMapillaryImageId(pos.id);
                  setStreetViewPos(pos);
                }}
                onHeadingChange={setViewerHeading}
                steerTarget={steerTarget}
                onSwitchToGoogle={(opts) => {
                  setViewerPanoMode('google');
                  if (opts?.lat && opts?.lng) {
                    setStreetViewPos({ lat: opts.lat, lng: opts.lng });
                  }
                }}
              />
            ) : (
              <GoogleStreetViewViewer
                lat={activeTouristSpot?.location?.lat ?? activeTouristSpot?.lat ?? streetViewPos?.lat ?? 17.612749}
                lng={activeTouristSpot?.location?.lng ?? activeTouristSpot?.lng ?? streetViewPos?.lng ?? 120.733755}
                heading={activeTouristSpot?.connected360?.heading !== undefined ? Number(activeTouristSpot.connected360.heading) : (viewerHeading || 0)}
                pitch={activeTouristSpot?.connected360?.pitch !== undefined ? Number(activeTouristSpot.connected360.pitch) : 0}
                title={activeTouristSpot?.name || 'Lagangilang, Abra'}
                onClose={handleCloseViewer}
                hasDedicatedCard={!!activeTouristSpot}
                onSwitchToMapillary={(opts) => {
                  setViewerPanoMode('mapillary');
                  if (opts?.imageId) setMapillaryImageId(opts.imageId);
                  if (opts?.lat && opts?.lng) {
                    setStreetViewPos({ lat: opts.lat, lng: opts.lng, id: opts.imageId });
                  }
                }}
              />
            )}

            {/* Top-Right Street View Controls (Full Screen & Exit, next to Mapillary playback bar) */}
            <div
              className="streetview-top-right-controls"
              style={{
                position: 'absolute',
                top: '12px',
                right: '14px',
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                pointerEvents: 'auto',
              }}
            >
              {/* Layout mode switcher: 50/50 Split or Full Browser Screen */}
              <button
                onClick={() => setViewerLayout(viewerLayout === 'fullscreen' ? 'split' : 'fullscreen')}
                title={viewerLayout === 'fullscreen' ? 'Restore to 50/50 Half Screen' : 'Expand to Full Browser Screen'}
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: 'var(--radius-full, 9999px)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  padding: '6px 14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(10px)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{viewerLayout === 'fullscreen' ? '◫' : '⛶'}</span>
                <span>{viewerLayout === 'fullscreen' ? '50/50 Split' : 'Full Screen'}</span>
              </button>

              {/* Close Button */}
              <button
                onClick={handleCloseViewer}
                title="Exit street view"
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: '50%',
                  color: '#f87171',
                  cursor: 'pointer',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(10px)',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== Right-Click & Touch Long-Press Context Menu ===== */}
      {contextMenu && (
        <div
          className="map-context-menu glass-panel"
          style={{
            position: 'fixed',
            left: Math.max(12, Math.min(contextMenu.x, window.innerWidth - 260)),
            top: Math.max(12, Math.min(contextMenu.y, window.innerHeight - 260)),
            zIndex: 'var(--z-modal)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Title and Close button for touchscreens */}
          <div className="ctx-header">
            <span className="ctx-title">📍 Location Menu</span>
            <button
              className="ctx-close-btn"
              onClick={() => setContextMenu(null)}
              title="Close menu"
            >
              ✕
            </button>
          </div>

          {/* Coordinates row */}
          <div className="ctx-coords">
            <span
              className="ctx-coords-text"
              title="Click to copy coordinates"
              onClick={() => handleCopyCoordinates(contextMenu.lat, contextMenu.lng)}
            >
              {contextMenu.lat.toFixed(6)}, {contextMenu.lng.toFixed(6)}
            </span>
            <button
              className={`ctx-copy-btn ${copiedCoords ? 'copied' : ''}`}
              title="Copy coordinates"
              onClick={() => handleCopyCoordinates(contextMenu.lat, contextMenu.lng)}
            >
              {copiedCoords ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>

          {/* Mapillary Image Key Badge & Copy Button (Admin Accessible) */}
          {contextMenu.imageId && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 10px',
                marginTop: '6px',
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                <span style={{ fontSize: '0.68rem', color: '#6ee7b7', fontWeight: 600 }}>
                  📸 Mapillary Image Key:
                </span>
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: '#ffffff',
                    userSelect: 'all',
                  }}
                  title="Click to copy Mapillary 64-bit Image Key"
                  onClick={() => {
                    navigator.clipboard.writeText(contextMenu.imageId);
                    setCopiedImageKey(true);
                    showToast(`📸 Mapillary Image Key ${contextMenu.imageId} copied!`);
                    setTimeout(() => setCopiedImageKey(false), 2000);
                  }}
                >
                  {contextMenu.imageId}
                </span>
              </div>
              <button
                type="button"
                className={`ctx-copy-btn ${copiedImageKey ? 'copied' : ''}`}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  borderRadius: 'var(--radius-sm)',
                  background: copiedImageKey ? '#10b981' : 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontWeight: 600,
                }}
                onClick={() => {
                  navigator.clipboard.writeText(contextMenu.imageId);
                  setCopiedImageKey(true);
                  showToast(`📸 Mapillary Image Key ${contextMenu.imageId} copied!`);
                  setTimeout(() => setCopiedImageKey(false), 2000);
                }}
                title="Copy Image Key to clipboard"
              >
                {copiedImageKey ? '✓ Copied' : '📋 Copy Key'}
              </button>
            </div>
          )}

          <hr />
          <button onClick={() => { setRouteOrigin([contextMenu.lng, contextMenu.lat]); setRouteData(null); setContextMenu(null); }}>
            🟢 Mark as Point A (Start)
          </button>
          <button onClick={() => { setRouteDestination([contextMenu.lng, contextMenu.lat]); setRouteData(null); setContextMenu(null); }}>
            🏁 Mark as Point B (Destination)
          </button>
          <button
            onClick={() => {
              setActiveTouristSpot(null);
              setStreetViewPos({ lat: contextMenu.lat, lng: contextMenu.lng });
              setViewerPanoMode('google');
              setViewerOpen(true);
              setContextMenu(null);
            }}
          >
            🌐 View in Google Street View
          </button>
          {contextMenu.imageId && (
            <button
              onClick={() => {
                setActiveTouristSpot(null);
                setMapillaryImageId(contextMenu.imageId);
                setStreetViewPos({ lat: contextMenu.lat, lng: contextMenu.lng, id: contextMenu.imageId });
                setViewerPanoMode('mapillary');
                setViewerOpen(true);
                setContextMenu(null);
              }}
            >
              🟢 View Mapillary 360 Photo ({contextMenu.imageId.slice(0, 8)}...)
            </button>
          )}
          <button
            onClick={() => {
              handleStartAligningAtCoord(contextMenu.lat, contextMenu.lng, contextMenu.sequenceId);
              setContextMenu(null);
            }}
          >
            📐 Bend / Re-align Streetview Line {contextMenu.sequenceId ? `(${contextMenu.sequenceId.slice(0, 8)}...)` : ''}
          </button>
          {isAdmin && contextMenu.sequenceId && (
            <>
              {streetviewAlignmentService.getAlignedSequence(contextMenu.sequenceId) && (
                <button
                  onClick={() => {
                    handleDeleteAlignment(contextMenu.sequenceId);
                    setContextMenu(null);
                  }}
                  style={{ color: '#fca5a5' }}
                >
                  🗑️ Delete Aligned Line ({contextMenu.sequenceId.slice(0, 8)}...)
                </button>
              )}
              <button
                onClick={() => {
                  handleToggleExcludeSequence(contextMenu.sequenceId);
                  setContextMenu(null);
                }}
                style={{
                  color: streetviewAlignmentService.isSequenceExcluded(contextMenu.sequenceId)
                    ? '#6ee7b7'
                    : '#f87171',
                }}
              >
                {streetviewAlignmentService.isSequenceExcluded(contextMenu.sequenceId)
                  ? `👁️ Restore Sequence (${contextMenu.sequenceId.slice(0, 8)}...)`
                  : `🚫 Exclude & Remove Sequence (${contextMenu.sequenceId.slice(0, 8)}...)`}
              </button>
            </>
          )}
          {isAdmin && (
            <>
              <hr />
              <button onClick={() => {
                setEditingSpot({
                  spotType: 'tourist_spot',
                  location: { lat: contextMenu.lat, lng: contextMenu.lng, address: '' },
                  connected360: contextMenu.imageId ? {
                    type: 'mapillary',
                    targetId: contextMenu.imageId,
                    heading: 0,
                    pitch: 0,
                  } : undefined,
                });
                setShowSpotModal(true);
                setContextMenu(null);
              }}>
                ⭐ Add Tourist Spot here {contextMenu.imageId ? '📸 (Auto-Linked to Image)' : ''}
              </button>
              <button onClick={() => {
                setEditingSpot({
                  spotType: 'poi',
                  location: { lat: contextMenu.lat, lng: contextMenu.lng, address: '' },
                  connected360: contextMenu.imageId ? {
                    type: 'mapillary',
                    targetId: contextMenu.imageId,
                    heading: 0,
                    pitch: 0,
                  } : undefined,
                });
                setShowSpotModal(true);
                setContextMenu(null);
              }}>
                📌 Add Point of Interest here {contextMenu.imageId ? '📸 (Auto-Linked to Image)' : ''}
              </button>
            </>
          )}
        </div>
      )}

      {/* ===== Excluded Sequences Modal (Admin) ===== */}
      {showExcludedModal && (
        <div className="modal-overlay" onClick={() => setShowExcludedModal(false)}>
          <div
            className="upload-modal glass-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '540px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>🚫 Excluded Streetview Lines</h2>
              <button className="btn btn-ghost" onClick={() => setShowExcludedModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Sequences listed here are completely excluded and removed from the map display (both aligned curves and raw Mapillary lines/dots).
            </p>

            {/* Manual sequence exclude input */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Paste sequence ID to exclude..."
                value={manualExcludeInput}
                onChange={(e) => setManualExcludeInput(e.target.value.trim())}
                style={{ flex: 1, fontSize: '0.85rem' }}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (manualExcludeInput) {
                    handleToggleExcludeSequence(manualExcludeInput);
                    setManualExcludeInput('');
                  }
                }}
                disabled={!manualExcludeInput}
                style={{ fontSize: '0.85rem', padding: '6px 14px' }}
              >
                + Exclude
              </button>
            </div>

            {/* Excluded list */}
            {excludedSequences.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No sequences are currently excluded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {excludedSequences.map((seqId) => (
                  <div
                    key={seqId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fca5a5' }}>
                        Sequence: <code>{seqId}</code>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Excluded from streetview &amp; map
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleToggleExcludeSequence(seqId)}
                      style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#34d399', borderColor: '#34d399' }}
                    >
                      👁️ Restore
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowExcludedModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Tourist Spot Modal (Admin) ===== */}
      <TouristSpotModal
        isOpen={showSpotModal}
        onClose={() => {
          setShowSpotModal(false);
          setEditingSpot(null);
        }}
        onSpotSaved={(saved) => {
          showToast(`✅ "${saved.name}" saved & synced to Neon Cloud!`);
          setSpotFilter('all');
          setBarangayFilter('all');
          setSidebarTab('spots');
          setSidebarOpen(true);
          loadTouristSpots();
          setActiveTouristSpot(saved);
          const savedLat = saved.location?.lat ?? saved.lat;
          const savedLng = saved.location?.lng ?? saved.lng;
          setMapCenterPos([savedLng, savedLat]);

          const targetPanoId = saved.connected360?.targetId || saved.primary_pano_id;
          const hasCustom360 =
            saved.connected360?.type === 'local' ||
            !!saved.connected360?.imageUrl ||
            String(targetPanoId || '').startsWith('pano_');

          if (hasCustom360) {
            setViewerPanoMode('dedicated');
            if (targetPanoId) {
              setLocalPanoramas((prev) => {
                if (!prev.some((p) => p.id === targetPanoId)) {
                  return [{ id: targetPanoId, label: saved.name, filename: `${targetPanoId}.jpg` }, ...prev];
                }
                return prev;
              });
            }
            handleSelectTouristSpot(saved);
          } else {
            setViewerOpen(false);
          }
        }}
        onSpotDeleted={(id) => {
          if (activeTouristSpot?.id === id) {
            setActiveTouristSpot(null);
          }
          loadTouristSpots();
          setShowSpotModal(false);
          setEditingSpot(null);
        }}
        editingSpot={editingSpot}
      />


      {/* ===== Admin Password Authorization & Change Modal ===== */}
      <AdminPasswordModal
        isOpen={showAdminPasswordModal}
        onClose={() => setShowAdminPasswordModal(false)}
        onSuccess={handleAdminAuthSuccess}
        isChangePassword={isChangePasswordMode}
        showToast={showToast}
      />

      {/* ===== Emergency Contacts & Trail Safety Modal ===== */}
      <EmergencyModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
      />

      {/* ===== Offline Guide & Data Saver Modal ===== */}
      <OfflineGuideModal
        isOpen={showOfflineModal}
        onClose={() => setShowOfflineModal(false)}
        touristSpots={touristSpots}
        customGeoJSON={null}
        showToast={showToast}
      />

      {/* ===== Floating Toast Notification ===== */}
      {toastMessage && (
        <div className="app-toast-notification">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

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
  isNearGoogleStreetViewCorridor,
  UA_CAMPUS_GATE,
  MAPILLARY_CAMPUS_GATE_IMAGE_ID,
} from './utils/streetViewJunctions';
import RoutePlanner from './components/RoutePlanner';
import RouteSummaryCard from './components/RouteSummaryCard';
import { getRoute } from './services/routingService';
import { streetviewAlignmentService } from './services/streetviewAlignmentService';
import StreetviewLineAligner from './components/StreetviewLineAligner';
import AdminPasswordModal from './components/AdminPasswordModal';
import EmergencyModal from './components/EmergencyModal';
import ThemeSelector from './components/ThemeSelector';
import WeatherWidget from './components/WeatherWidget';
import OfflineGuideModal from './components/OfflineGuideModal';
import AdminOsmManagerModal from './components/AdminOsmManagerModal';
import hotlinesService from './services/hotlinesService';
import globalSyncService, { GLOBAL_STATE_KEYS } from './services/globalSyncService';
import { getPinTheme } from './utils/poiIconRegistry';

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
  const [sidebarTab, setSidebarTab] = useState('spots'); // 'spots' | 'routing'
  
  // Tourist Spots & POI State (Offline-first initialized with all 45 authoritative spots)
  const [touristSpots, setTouristSpots] = useState(() => touristSpotsService.getAllSpots());
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
  const [showCustomOSM, setShowCustomOSM] = useState(true);
  const [showOsmManagerModal, setShowOsmManagerModal] = useState(false);

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
  const [cloudSyncStatus, setCloudSyncStatus] = useState('synced'); // 'syncing' | 'synced' | 'error'

  // Theme & Auth State
  const [mapTheme, setMapTheme] = useState(() => {
    const saved = localStorage.getItem('lagangilang_map_theme');
    if (!saved || saved === 'offline') {
      localStorage.setItem('lagangilang_map_theme', 'light');
      return 'light';
    }
    return saved;
  }); // 'dark' | 'light' | 'beige' | 'satellite'
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
  const [assigningNodeForSpot, setAssigningNodeForSpot] = useState(null);
  const { searchNearby } = useMapillary();

  // Admin Master Toggle for Sequence & Junction Bridges (Default OFF / Hidden per Phase 6)
  const [showBridgePrompts, setShowBridgePrompts] = useState(() => {
    try {
      return localStorage.getItem('lagangilang_show_bridge_prompts') === 'true';
    } catch (_) {
      return false;
    }
  });

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
  const [selectedHandleIndex, setSelectedHandleIndex] = useState(null);

  const handleRemoveHandle = useCallback((indexToRemove) => {
    if (!aligningSequence) return;
    const targetIdx = (indexToRemove !== undefined && indexToRemove !== null) ? indexToRemove : selectedHandleIndex;
    if (targetIdx === null || targetIdx === undefined) {
      showToast('ℹ️ Tap any cyan node on the map to select and remove it.');
      return;
    }
    if (aligningSequence.controlPoints.length <= 2) {
      showToast('⚠️ Line requires at least 2 endpoints.');
      return;
    }
    const newControlPoints = aligningSequence.controlPoints.filter((_, i) => i !== targetIdx);
    const { coordinates, mappedImages } = streetviewAlignmentService.generateBentGeometry(
      newControlPoints,
      aligningSequence.images
    );
    setAligningSequence({
      ...aligningSequence,
      controlPoints: newControlPoints,
      coordinates,
      images: mappedImages,
    });
    setSelectedHandleIndex(null);
    showToast(`🗑️ Removed curve handle #${targetIdx + 1}`);
  }, [aligningSequence, selectedHandleIndex, showToast]);

  const handleAddHandleNext = useCallback((idx) => {
    if (!aligningSequence) return;
    const cps = aligningSequence.controlPoints;
    if (cps.length < 2) return;

    const targetIdx = (idx !== undefined && idx !== null) ? idx : (selectedHandleIndex ?? (cps.length - 2));
    let insertIdx = targetIdx + 1;
    let newCoord;
    if (targetIdx < cps.length - 1) {
      newCoord = [
        (cps[targetIdx][0] + cps[targetIdx + 1][0]) / 2,
        (cps[targetIdx][1] + cps[targetIdx + 1][1]) / 2,
      ];
    } else {
      newCoord = [
        (cps[targetIdx - 1][0] + cps[targetIdx][0]) / 2,
        (cps[targetIdx - 1][1] + cps[targetIdx][1]) / 2,
      ];
      insertIdx = targetIdx;
    }

    const newControlPoints = [...cps];
    newControlPoints.splice(insertIdx, 0, newCoord);

    const { coordinates, mappedImages } = streetviewAlignmentService.generateBentGeometry(
      newControlPoints,
      aligningSequence.images
    );

    setAligningSequence({
      ...aligningSequence,
      controlPoints: newControlPoints,
      coordinates,
      images: mappedImages,
    });
    setSelectedHandleIndex(insertIdx);
    showToast(`✨ Added curve handle #${insertIdx + 1}`);
  }, [aligningSequence, selectedHandleIndex, showToast]);

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
      // Auto-enable Mapillary streetview, dots and lines so user can see photo dots along road
      setShowMapillaryStreetview(true);
      setShowMapillaryDots(true);
      setShowMapillaryLines(true);
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
      // Auto-enable Mapillary streetview, dots and lines so user can see photo dots along road
      setShowMapillaryStreetview(true);
      setShowMapillaryDots(true);
      setShowMapillaryLines(true);
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

  // Excluded Streetview Sequences & Buggy Images State
  const [excludedSequences, setExcludedSequences] = useState(() => streetviewAlignmentService.getExcludedSequences());
  const [excludedImageKeys, setExcludedImageKeys] = useState(() => streetviewAlignmentService.getExcludedImages());
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [manualExcludeInput, setManualExcludeInput] = useState('');
  const [manualExcludeImageInput, setManualExcludeImageInput] = useState('');

  const handleDeleteAlignment = useCallback(async (sequenceId) => {
    if (!isAdmin) return;
    await streetviewAlignmentService.deleteAlignedSequence(sequenceId);
    setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
    if (aligningSequence?.sequenceId === sequenceId) {
      setAligningSequence(null);
    }
    showToast(`🗑️ Alignment deleted for sequence ${sequenceId.slice(0, 8)}... (reverted to raw)`);
  }, [isAdmin, aligningSequence, showToast]);

  const handleResetNodesToGps = useCallback(async (sequenceId) => {
    if (!isAdmin || !sequenceId) return;
    try {
      await streetviewAlignmentService.resetSequenceNodesToOriginalGps(sequenceId);
      setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
      showToast(`↩️ Sequence ${sequenceId.slice(0, 8)}... 360 photo nodes restored to camera GPS`);
    } catch (e) {
      showToast(`⚠️ Could not reset nodes: ${e.message}`);
    }
  }, [isAdmin, showToast]);

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

  const handleToggleExcludeImage = useCallback((imageId) => {
    if (!isAdmin) return;
    if (streetviewAlignmentService.isImageExcluded(imageId)) {
      const updated = streetviewAlignmentService.restoreImage(imageId);
      setExcludedImageKeys(updated);
      setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
      showToast(`👁️ Image node ${imageId.slice(0, 8)}... restored`);
    } else {
      const updated = streetviewAlignmentService.excludeImage(imageId);
      setExcludedImageKeys(updated);
      setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
      showToast(`🚫 Image node ${imageId.slice(0, 8)}... excluded`);
    }
  }, [isAdmin, showToast]);

  const handleCalibrateNodePosition = useCallback((imageId, lat, lng) => {
    if (!isAdmin) return;
    streetviewAlignmentService.setNodeOverride(imageId, { lat, lng });
    setStreetViewPos((prev) => (prev ? { ...prev, lat, lng, isAligned: true } : prev));
    setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
    showToast(`📍 Node GPS calibrated: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  }, [isAdmin, showToast]);

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

  // Switch active navigation route among alternatives
  const handleSelectRouteIndex = useCallback((index) => {
    setRouteData((prev) => {
      if (!prev?.allRoutes || !prev.allRoutes[index]) return prev;
      const target = prev.allRoutes[index];
      return {
        ...target,
        allRoutes: prev.allRoutes,
        alternatives: prev.allRoutes.filter((_, i) => i !== index),
        activeRouteIndex: index,
      };
    });
    showToast(`🔄 Switched to Route ${index + 1}`);
  }, [showToast]);

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
    const hotlinePois = hotlinesService.asMapPois();
    const merged = [...spots];
    hotlinePois.forEach((hp) => {
      const idx = merged.findIndex((s) => s.id === hp.id);
      if (idx >= 0) {
        const hpTime = new Date(hp.updated_at || 0).getTime();
        const spotTime = new Date(merged[idx].updated_at || 0).getTime();
        const preferredLat = hpTime > spotTime ? hp.lat : (merged[idx].location?.lat ?? merged[idx].lat ?? hp.lat);
        const preferredLng = hpTime > spotTime ? hp.lng : (merged[idx].location?.lng ?? merged[idx].lng ?? hp.lng);
        merged[idx] = {
          ...hp,
          ...merged[idx],
          phone: merged[idx].phone || hp.phone,
          altPhone: merged[idx].altPhone || hp.altPhone,
          operatingHours: merged[idx].operatingHours || hp.operatingHours,
          lat: preferredLat,
          lng: preferredLng,
          location: {
            ...(hp.location || {}),
            ...(merged[idx].location || {}),
            lat: preferredLat,
            lng: preferredLng,
          },
        };
      } else {
        merged.push(hp);
      }
    });
    setTouristSpots(merged);

    // True zero-network offline mode: If offline, block all cloud network fetches!
    if (!isOnline) {
      import('./services/offlineMapManager').then(({ default: mgr }) => {
        mgr.getBundleData().then((bundle) => {
          if (bundle && Array.isArray(bundle.touristSpots) && bundle.touristSpots.length > 0) {
            setTouristSpots(bundle.touristSpots);
          }
        }).catch(() => {});
      }).catch(() => {});
      return;
    }

    // 2. Fetch local panoramas list from Neon Cloud (online only)
    touristSpotsService
      .fetchPanoramasList()
      .then((panos) => {
        if (Array.isArray(panos) && panos.length > 0) {
          setLocalPanoramas(panos);
        }
      })
      .catch(() => {});

    // 3. Background cloud synchronization with Neon PostgreSQL (online only)
    touristSpotsService
      .fetchFromCloud()
      .then((cloudSpots) => {
        if (Array.isArray(cloudSpots) && cloudSpots.length > 0) {
          const freshHotlines = hotlinesService.asMapPois();
          const mergedCloud = [...cloudSpots];
          freshHotlines.forEach((hp) => {
            const idx = mergedCloud.findIndex((s) => s.id === hp.id);
            if (idx >= 0) {
              const hpTime = new Date(hp.updated_at || 0).getTime();
              const cloudTime = new Date(mergedCloud[idx].updated_at || 0).getTime();
              const preferredLat = hpTime > cloudTime ? hp.lat : (mergedCloud[idx].location?.lat ?? mergedCloud[idx].lat ?? hp.lat);
              const preferredLng = hpTime > cloudTime ? hp.lng : (mergedCloud[idx].location?.lng ?? mergedCloud[idx].lng ?? hp.lng);
              mergedCloud[idx] = {
                ...hp,
                ...mergedCloud[idx],
                phone: mergedCloud[idx].phone || hp.phone,
                altPhone: mergedCloud[idx].altPhone || hp.altPhone,
                operatingHours: mergedCloud[idx].operatingHours || hp.operatingHours,
                lat: preferredLat,
                lng: preferredLng,
                location: {
                  ...(hp.location || {}),
                  ...(mergedCloud[idx].location || {}),
                  lat: preferredLat,
                  lng: preferredLng,
                },
              };
            } else {
              mergedCloud.push(hp);
            }
          });
          setTouristSpots(mergedCloud);
        }
      })
      .catch(() => {});

    // 4. Background synchronization of aligned streetview sequences (Bundled + Neon DB)
    streetviewAlignmentService
      .syncWithBackend()
      .then(() => {
        setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
      })
      .catch(() => {});
  }, []);

  // Listen for aligned streetview updates from cloud sync or static bundling
  useEffect(() => {
    const handleAlignedUpdate = (evt) => {
      setAlignedGeoJSON(evt.detail || streetviewAlignmentService.toGeoJSON());
      setExcludedSequences(streetviewAlignmentService.getExcludedSequences());
      setExcludedImageKeys(streetviewAlignmentService.getExcludedImages());
    };
    window.addEventListener('aligned-sequences-updated', handleAlignedUpdate);
    return () => window.removeEventListener('aligned-sequences-updated', handleAlignedUpdate);
  }, []);

  // Real-time synchronization when hotlines or DENR Checkpoints change
  useEffect(() => {
    const unsub = hotlinesService.subscribe(() => {
      loadTouristSpots();
    });
    return () => unsub();
  }, [loadTouristSpots]);

  // Filter spots by Tourist Attraction vs Service/POI and Barangay, sorted alphabetically (A-Z)
  const displayedSpots = useMemo(() => {
    const list = touristSpots.filter((s) => {
      const isPoi = (s.spotType || s.type) === 'poi';
      if (spotFilter === 'tourist_spot' && isPoi) return false;
      if (spotFilter === 'poi' && !isPoi) return false;
      if (barangayFilter !== 'all' && s.barangay !== barangayFilter) return false;
      return true;
    });

    return list.slice().sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  }, [touristSpots, spotFilter, barangayFilter]);

  useEffect(() => {
    loadTouristSpots();
  }, [loadTouristSpots]);

  // Master Real-Time Global Cloud Sync with Neon PostgreSQL (One Global Truth across devices)
  useEffect(() => {
    globalSyncService.startAutoSync();
    const unsub = globalSyncService.subscribe((evt) => {
      if (evt.type === 'status_change') {
        setCloudSyncStatus(evt.status);
      } else if (evt.type === 'state_updated' || evt.type === 'key_saved') {
        const state = evt.state || globalSyncService.cachedState;
        if (state && Array.isArray(state[GLOBAL_STATE_KEYS.POIS]) && state[GLOBAL_STATE_KEYS.POIS].length > 0) {
          setTouristSpots(state[GLOBAL_STATE_KEYS.POIS]);
        }
        if (state && Array.isArray(state[GLOBAL_STATE_KEYS.HOTLINES]) && state[GLOBAL_STATE_KEYS.HOTLINES].length > 0) {
          hotlinesService.saveAll(state[GLOBAL_STATE_KEYS.HOTLINES], false);
        }
        if (state && state[GLOBAL_STATE_KEYS.TRAILS]) {
          streetviewAlignmentService.loadFromGlobalState(state[GLOBAL_STATE_KEYS.TRAILS]);
          setExcludedSequences(streetviewAlignmentService.getExcludedSequences());
          setExcludedImageKeys(streetviewAlignmentService.getExcludedImages());
          setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
        }
        if (state && state[GLOBAL_STATE_KEYS.ADMIN_PASSWORD]?.password) {
          try {
            localStorage.setItem('lagangilang_admin_password', state[GLOBAL_STATE_KEYS.ADMIN_PASSWORD].password);
          } catch (_) {}
        }
      }
    });

    return () => {
      unsub();
      globalSyncService.stopAutoSync();
    };
  }, []);

  // Initial authoritative global state fetch on startup (guarantees dragged pins propagate to first-time users)
  useEffect(() => {
    async function loadGlobalPublicState() {
      try {
        const res = await fetch(`/api/public-state?t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.pois && Array.isArray(data.pois) && data.pois.length >= 40) {
            touristSpotsService.saveAllSpots(data.pois, false);
            setTouristSpots(data.pois);
          }
          if (data.hotlines && Array.isArray(data.hotlines) && data.hotlines.length > 0) {
            hotlinesService.saveAll(data.hotlines, false);
          }
          if (data.trails) {
            streetviewAlignmentService.loadFromGlobalState(data.trails);
            setExcludedSequences(streetviewAlignmentService.getExcludedSequences());
            setExcludedImageKeys(streetviewAlignmentService.getExcludedImages());
            setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
          }
        }
      } catch (e) {
        console.warn('Failed to load global cloud state from /api/public-state:', e);
      }
    }
    loadGlobalPublicState();
  }, []);

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

  // Compute the closest aligned cyan node to the currently active spot (across all active sequences)
  const nearestAlignedForActiveSpot = useMemo(() => {
    if (!activeTouristSpot) return null;
    const lat = activeTouristSpot.location?.lat ?? activeTouristSpot.lat;
    const lng = activeTouristSpot.location?.lng ?? activeTouristSpot.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return streetviewAlignmentService.findClosestImageAcrossAll(lat, lng, Infinity);
  }, [activeTouristSpot, alignedGeoJSON]);

  // Admin action: Assign a specific cyan node as the 360 street view for a landmark
  const handleAssignNearestNodeToSpot = useCallback(
    async (nodeInfo, spotToAssign = null) => {
      const targetSpot = spotToAssign || activeTouristSpot;
      if (!targetSpot || !nodeInfo) return;
      const imgId = String(nodeInfo.image?.id || nodeInfo.id || nodeInfo.imgId || '');
      if (!imgId) return;

      const nodeLat = nodeInfo.image?.lat ?? nodeInfo.lat;
      const nodeLng = nodeInfo.image?.lng ?? nodeInfo.lng;
      const nodeHeading = nodeInfo.image?.alignedHeading ?? nodeInfo.image?.heading ?? 0;

      const updates = {
        connected360: {
          type: 'mapillary',
          targetId: imgId,
          sequenceId: nodeInfo.sequenceId || targetSpot.connected360?.sequenceId,
          lat: nodeLat,
          lng: nodeLng,
          heading: nodeHeading,
          pitch: 0,
        },
        primary_pano_id: imgId,
        sync_status: 'staged_local',
        updated_at: new Date().toISOString(),
      };

      try {
        await touristSpotsService.updateSpot(targetSpot.id, updates);
        await touristSpotsService.syncToNeonCloud(targetSpot.id).catch(() => {});
        loadTouristSpots();
        const refreshedSpot = { ...targetSpot, ...updates };
        setActiveTouristSpot(refreshedSpot);
        setMapillaryImageId(imgId);
        setStreetViewPos({
          lat: nodeLat ?? targetSpot.lat,
          lng: nodeLng ?? targetSpot.lng,
          id: imgId,
        });
        setViewerPanoMode('mapillary');
        showToast(`✅ Assigned cyan node #${imgId.slice(-6)} to "${targetSpot.name}" & synced to Neon Cloud!`);
      } catch (err) {
        showToast(`⚠️ Failed to assign node: ${err.message}`);
      }
    },
    [activeTouristSpot, loadTouristSpots, showToast]
  );

  const handleStartPickNodeFromMap = useCallback(() => {
    if (!activeTouristSpot) return;
    setAssigningNodeForSpot(activeTouristSpot);
    setViewerOpen(false);
    showToast(`🎯 Tap any cyan node on the road map to assign it to "${activeTouristSpot.name}"`);
  }, [activeTouristSpot, showToast]);

  // Handle selecting a Tourist Spot (POI) from map or sidebar
  const handleSelectTouristSpot = useCallback(
    async (spot) => {
      setActiveTouristSpot(spot);
      setViewerOpen(true);

      const lat = spot.location?.lat ?? spot.lat;
      const lng = spot.location?.lng ?? spot.lng;

      // 1. Check if spot has a verified dedicated uploaded photosphere
      const customPanoId = spot.connected360?.targetId || spot.primary_pano_id;
      const isLocalPano = spotHasDedicatedPano(spot);

      // 2. Check if spot has an assigned Mapillary 360 cyan node
      const isAssignedMapillary =
        !isLocalPano &&
        spot.connected360?.type === 'mapillary' &&
        customPanoId &&
        String(customPanoId).length >= 10 &&
        /^\d+$/.test(String(customPanoId));

      // 3. Find closest cyan node along ALL active re-aligned road sequences in Lagangilang
      const nearestAligned = (typeof lat === 'number' && typeof lng === 'number')
        ? streetviewAlignmentService.findClosestImageAcrossAll(lat, lng, Infinity)
        : null;
      const nearestMapillaryId = nearestAligned?.image?.id ? String(nearestAligned.image.id) : null;
      const effectiveMapillaryId = isAssignedMapillary
        ? String(customPanoId)
        : (nearestMapillaryId || MAPILLARY_CAMPUS_GATE_IMAGE_ID);

      // Preset mapillaryImageId so switching to Mapillary jumps directly to the closest cyan node
      setMapillaryImageId(effectiveMapillaryId);

      if (isLocalPano) {
        setViewerPanoMode('dedicated');
        setStreetViewPos({ lat, lng, id: String(customPanoId || spot.id) });
      } else if (isAssignedMapillary) {
        setViewerPanoMode('mapillary');
        setStreetViewPos({
          lat: spot.connected360?.lat ?? nearestAligned?.image?.lat ?? lat,
          lng: spot.connected360?.lng ?? nearestAligned?.image?.lng ?? lng,
          id: String(customPanoId),
        });
      } else if (spot.connected360?.type === 'google') {
        // Explicitly set to Google Street View
        setViewerPanoMode('google');
        setStreetViewPos({ lat, lng, id: String(spot.id) });
      } else {
        // Smart determination between Google Street View and Mapillary:
        const insideCampus = isInsideUACampus(lat, lng);
        const nearGoogleCorridor = isNearGoogleStreetViewCorridor(lat, lng, spot);

        // If inside UA Campus grounds or remote nature trail (Caves, Dam, River, Rock Formation):
        if (insideCampus || !nearGoogleCorridor) {
          setViewerPanoMode('mapillary');
          setStreetViewPos({
            lat: nearestAligned?.image?.lat ?? lat,
            lng: nearestAligned?.image?.lng ?? lng,
            id: effectiveMapillaryId,
          });
        } else {
          // National Highway Route 204 / Poblacion / Laang / Balais corridor covered by Google Street View
          setViewerPanoMode('google');
          setStreetViewPos({ lat, lng, id: String(spot.id) });
        }
      }

      // 4. Orient the 360 viewer toward the landmark's heading
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
    [spotHasDedicatedPano, viewerPanoMode]
  );

  const handleToggleViewerMode = useCallback((mode, spot = null) => {
    const targetSpot = spot || activeTouristSpot;
    const targetLat = targetSpot?.location?.lat ?? targetSpot?.lat ?? streetViewPos?.lat;
    const targetLng = targetSpot?.location?.lng ?? targetSpot?.lng ?? streetViewPos?.lng;

    if (mode === 'mapillary') {
      setViewerPanoMode('mapillary');
      const customPanoId = targetSpot?.connected360?.targetId || targetSpot?.primary_pano_id;
      const isAssignedMapillary =
        targetSpot?.connected360?.type === 'mapillary' &&
        customPanoId &&
        String(customPanoId).length >= 10 &&
        /^\d+$/.test(String(customPanoId));

      if (isAssignedMapillary) {
        const dedicatedId = String(customPanoId);
        setMapillaryImageId(dedicatedId);
        setStreetViewPos({
          lat: targetSpot?.connected360?.lat ?? targetLat ?? 17.60811,
          lng: targetSpot?.connected360?.lng ?? targetLng ?? 120.73816,
          id: dedicatedId,
        });
        return;
      }

      // Switch to the nearest cyan node along ALL active re-aligned sequences in Lagangilang
      if (typeof targetLat === 'number' && typeof targetLng === 'number') {
        const nearest = streetviewAlignmentService.findClosestImageAcrossAll(targetLat, targetLng, Infinity);
        if (nearest?.image?.id) {
          const nearestId = String(nearest.image.id);
          setMapillaryImageId(nearestId);
          setStreetViewPos({
            lat: nearest.image.lat,
            lng: nearest.image.lng,
            id: nearestId,
          });
          return;
        }
      }

      setMapillaryImageId(MAPILLARY_CAMPUS_GATE_IMAGE_ID);
      return;
    }

    if (mode === 'google') {
      setViewerPanoMode('google');
      if (typeof targetLat === 'number' && typeof targetLng === 'number') {
        setStreetViewPos((prev) => ({
          lat: targetLat,
          lng: targetLng,
          id: targetSpot?.id || prev?.id || 'google_view',
        }));
      }
      return;
    }

    if (mode === 'dedicated') {
      const customPanoId = targetSpot?.connected360?.targetId || targetSpot?.primary_pano_id;
      const isAssignedMapillary =
        targetSpot?.connected360?.type === 'mapillary' &&
        customPanoId &&
        String(customPanoId).length >= 10 &&
        /^\d+$/.test(String(customPanoId));
      if (isAssignedMapillary) {
        setViewerPanoMode('mapillary');
        setMapillaryImageId(String(customPanoId));
        setStreetViewPos({
          lat: targetSpot?.connected360?.lat ?? targetLat,
          lng: targetSpot?.connected360?.lng ?? targetLng,
          id: String(customPanoId),
        });
        return;
      }
      setViewerPanoMode('dedicated');
    }
  }, [activeTouristSpot, streetViewPos]);

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
      
      // Fast granular updates to local and Neon DB
      touristSpotsService.updateSpotLocation(spotId, lat, lng);
      hotlinesService.updateCoordinates(spotId, { lat, lng });

      // Direct POST to authoritative backend endpoint /api/update-pin-location
      const spot = touristSpots.find((s) => s.id === spotId);
      const spotType = spot?.spotType || spot?.type || (spotId.startsWith('poi_denr') || spotId.startsWith('poi_lagangilang_mdrrmo') || spotId.startsWith('poi_lagangilang_pnp') || spotId.startsWith('poi_lagangilang_bfp') || spotId.startsWith('poi_lagangilang_rhu') ? 'hotline' : 'poi');
      const spotName = spot?.name || 'Landmark';

      fetch('/api/update-pin-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: spotId,
          type: spotType,
          lat,
          lng,
        }),
      })
        .then((res) => {
          if (!res.ok) console.warn('[App] /api/update-pin-location non-200 response');
        })
        .catch((err) => console.warn('[App] /api/update-pin-location call warning:', err));

      const updatedSpots = touristSpots.map((s) =>
        s.id === spotId ? { ...s, location: { ...(s.location || {}), lat, lng }, lat, lng, updated_at: new Date().toISOString() } : s
      );
      setTouristSpots(updatedSpots);

      // Keep active routing destination in sync if user dragged the destination pin
      if (routeDestination && typeof routeDestination[0] === 'number' && typeof routeDestination[1] === 'number') {
        const prev = touristSpots.find((s) => s.id === spotId);
        if (prev) {
          const prevLat = prev.location?.lat ?? prev.lat;
          const prevLng = prev.location?.lng ?? prev.lng;
          if (Math.hypot(routeDestination[0] - prevLng, routeDestination[1] - prevLat) < 0.0006) {
            setRouteDestination([lng, lat]);
          }
        }
      }

      // Keep active routing origin in sync if user dragged the origin pin
      if (routeOrigin && typeof routeOrigin[0] === 'number' && typeof routeOrigin[1] === 'number') {
        const prev = touristSpots.find((s) => s.id === spotId);
        if (prev) {
          const prevLat = prev.location?.lat ?? prev.lat;
          const prevLng = prev.location?.lng ?? prev.lng;
          if (Math.hypot(routeOrigin[0] - prevLng, routeOrigin[1] - prevLat) < 0.0006) {
            setRouteOrigin([lng, lat]);
          }
        }
      }

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

      showToast(`📍 Saved new position for "${spotName}" globally`);

      // Real-time route recalculation if current origin or destination was pointing to this moved spot
      const oldLat = spot?.location?.lat ?? spot?.lat;
      const oldLng = spot?.location?.lng ?? spot?.lng;

      if (routeDestination && oldLat && oldLng) {
        if (Math.hypot(routeDestination[0] - oldLng, routeDestination[1] - oldLat) < 0.0008) {
          setRouteDestination([lng, lat]);
          setRouteData(null);
        }
      }
      if (routeOrigin && oldLat && oldLng) {
        if (Math.hypot(routeOrigin[0] - oldLng, routeOrigin[1] - oldLat) < 0.0008) {
          setRouteOrigin([lng, lat]);
          setRouteData(null);
        }
      }
    },
    [activeTouristSpot, touristSpots, routeOrigin, routeDestination, showToast]
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

      // If we are currently assigning a cyan node to a landmark spot
      if (assigningNodeForSpot) {
        const targetSpot = assigningNodeForSpot;
        setAssigningNodeForSpot(null);
        let resolvedNode = null;
        if (clickedMapillaryId && String(clickedMapillaryId).length >= 10) {
          resolvedNode = { id: String(clickedMapillaryId), lat, lng };
        } else {
          const nearest = streetviewAlignmentService.findClosestImageAcrossAll(lat, lng, 60);
          if (nearest?.image?.id) {
            resolvedNode = {
              id: String(nearest.image.id),
              lat: nearest.image.lat,
              lng: nearest.image.lng,
              heading: nearest.image.alignedHeading ?? nearest.image.heading ?? 0,
              sequenceId: nearest.sequenceId,
            };
          }
        }

        if (resolvedNode) {
          await handleAssignNearestNodeToSpot(resolvedNode, targetSpot);
          setViewerOpen(true);
          return;
        } else {
          showToast('⚠️ No cyan node clicked. Please tap directly on a cyan dot or streetview line.');
          return;
        }
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
    [routingMode, pickingTarget, handleMapClickForRouting, assigningNodeForSpot, handleAssignNearestNodeToSpot, searchNearby, showToast]
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

  // Gracefully switch to Street View if 360 photo unavailable
  const handleFallbackToMapillary = useCallback(() => {
    showToast('🔄 Switching to Street View...');
    const lat = activeTouristSpot?.location?.lat ?? activeTouristSpot?.lat;
    const lng = activeTouristSpot?.location?.lng ?? activeTouristSpot?.lng;
    if (typeof lat === 'number' && typeof lng === 'number') {
      const insideCampus = isInsideUACampus(lat, lng);
      const nearGoogle = isNearGoogleStreetViewCorridor(lat, lng, activeTouristSpot);

      // If location is outside UA campus along the official Google Street View highway corridor
      if (!insideCampus && nearGoogle) {
        setViewerPanoMode('google');
        setStreetViewPos({ lat, lng, id: String(activeTouristSpot?.id || 'google_view') });
        return;
      }

      // Otherwise find nearest cyan node along trails / campus
      const nearest = streetviewAlignmentService.findClosestImageAcrossAll(lat, lng, Infinity);
      if (nearest?.image?.id) {
        const nearestId = String(nearest.image.id);
        setViewerPanoMode('mapillary');
        setMapillaryImageId(nearestId);
        setStreetViewPos({
          lat: nearest.image.lat,
          lng: nearest.image.lng,
          id: nearestId,
        });
        return;
      }
    }
    setViewerPanoMode('google');
  }, [activeTouristSpot, showToast]);

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
      setSidebarTab('spots');
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

  // Secret 5-tap developer mode gesture on "Road & Trail" to access Admin Mode
  const brandTapCountRef = useRef(0);
  const brandTapTimerRef = useRef(null);

  const handleBrandPillTap = useCallback(() => {
    if (brandTapTimerRef.current) {
      clearTimeout(brandTapTimerRef.current);
    }

    brandTapCountRef.current += 1;
    const currentTaps = brandTapCountRef.current;

    // Reset tap sequence after 2.5 seconds of inactivity
    brandTapTimerRef.current = setTimeout(() => {
      brandTapCountRef.current = 0;
    }, 2500);

    // Subtle tactile feedback on supported mobile/touch devices
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(35);
      } catch (_) {}
    }

    if (isAdmin) {
      if (currentTaps >= 5) {
        brandTapCountRef.current = 0;
        showToast('🛡️ Admin Panel is already active');
      }
      return;
    }

    // Android Developer Options style progressive feedback
    if (currentTaps === 3) {
      showToast('🛠️ 2 taps away from Admin Access...');
    } else if (currentTaps === 4) {
      showToast('🛠️ 1 tap away from Admin Access...');
    } else if (currentTaps >= 5) {
      brandTapCountRef.current = 0;
      if (brandTapTimerRef.current) clearTimeout(brandTapTimerRef.current);
      setIsChangePasswordMode(false);
      setShowAdminPasswordModal(true);
      showToast('🔐 Enter Admin Password to unlock');
    }
  }, [isAdmin, showToast]);

  useEffect(() => {
    return () => {
      if (brandTapTimerRef.current) clearTimeout(brandTapTimerRef.current);
    };
  }, []);

  const stagedCount = touristSpots.filter((s) => s.sync_status === 'staged_local').length;

  return (
    <div className="app-container">
      {/* ===== Map Panel ===== */}
      <div
        className={`panel-map ${!viewerOpen ? 'expanded' : ''} ${viewerOpen && viewerLayout === 'split' ? 'split-active' : ''} ${viewerOpen && viewerLayout === 'fullscreen' ? 'fullscreen-collapsed' : ''} ${isAdmin ? 'admin-mode' : ''}`}
        style={viewerOpen && viewerLayout === 'split' ? { flex: `0 0 ${mapWidth}%` } : {}}
      >
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
          routeData={routeData}
          routeOrigin={routeOrigin}
          routeDestination={routeDestination}
          routingProfile={routingProfile}
          onSelectRouteIndex={handleSelectRouteIndex}
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
          excludedImageKeys={excludedImageKeys}
          onCalibrateNodePosition={handleCalibrateNodePosition}
          selectedHandleIndex={selectedHandleIndex}
          onSelectHandleIndex={setSelectedHandleIndex}
          onRemoveHandle={handleRemoveHandle}
          onAddHandleNext={handleAddHandleNext}
        />

        {/* Map top controls */}
        <div className="map-overlay-top">
          {routeData ? (
            <RouteSummaryCard
              routeData={routeData}
              routeOrigin={routeOrigin}
              routeDestination={routeDestination}
              routingProfile={routingProfile}
              onProfileChange={(newProf) => setRoutingProfile(newProf)}
              onTriggerPopups={() => window.dispatchEvent(new CustomEvent('show-route-popups'))}
              touristSpots={touristSpots}
              isSplitView={viewerOpen && viewerLayout === 'split'}
              onReverseRoute={handleSwapPoints}
              onClearRoute={() => {
                handleClearRoute();
                setIsNavigating(false);
                showToast('Navigation closed — Nav bar restored');
              }}
              onChangeDestination={() => {
                setSidebarTab('routing');
                setSidebarOpen(true);
              }}
              onSelectRouteIndex={handleSelectRouteIndex}
            />
          ) : (
            /* Horizontally scrollable/dynamic action bar across all aspect ratios */
            <div className="nav-scroll-container">
            {/* Tourism Brand Header Pill (Desktop only; hidden when Admin is active) */}
            {!isAdmin && (
              <div
                className="brand-pill brand-pill-desktop"
                onClick={handleBrandPillTap}
                role="button"
                tabIndex={0}
                title="Road & Trail • Lagangilang Tourism System (Admin Access: Tap 5x)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBrandPillTap();
                  }
                }}
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  backdropFilter: 'blur(8px)',
                  boxShadow: 'none',
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'manipulation',
                  transition: 'transform 0.1s ease, background 0.15s ease',
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.95)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                onTouchStart={(e) => {
                  e.currentTarget.style.transform = 'scale(0.95)';
                }}
                onTouchEnd={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <span>Road & Trail</span>
              </div>
            )}

            {/* Live Weather & Trail Advisory Pill (Online only) */}
            {isOnline && <WeatherWidget isCompact={true} />}

            {/* Emergency Hotlines Button (Available 100% Online & Offline) */}
            <button
              className="btn btn-secondary btn-emergency-top"
              onClick={() => setShowEmergencyModal(true)}
              title="Official Lagangilang LGU Emergency Hotlines & DENR Checkpoints"
              style={{
                fontSize: '0.8rem',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                background: 'rgba(15, 23, 42, 0.92)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#ffffff',
                boxShadow: 'none',
                backdropFilter: 'blur(12px)',
              }}
            >
              <span>🚨</span>
              <span className="btn-label-text">Hotlines</span>
            </button>

            {/* Route Button (Tourist prominent, Online only per Phase 6) */}
            {isOnline && (
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
                  boxShadow: 'none',
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
            )}

            {/* High-Capacity Offline Map & Data Packager Button */}
            <button
              className="btn btn-secondary"
              onClick={() => setShowOfflineModal(true)}
              title="Download Full Offline Map Tiles & Data Bundle for Zero-Signal Trails"
              style={{
                fontSize: '0.8rem',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                background: 'rgba(15, 23, 42, 0.92)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#6ee7b7',
                boxShadow: 'none',
                backdropFilter: 'blur(12px)',
              }}
            >
              <span>📥</span>
              <span className="btn-label-text">Offline</span>
            </button>

            {/* Custom Theme Selector Dropdown */}
            <ThemeSelector
              theme={mapTheme}
              onChange={(t) => {
                setMapTheme(t);
                localStorage.setItem('lagangilang_map_theme', t);
                showToast(`Map theme: ${t.charAt(0).toUpperCase() + t.slice(1)}`);
              }}
            />

            {/* Admin-only controls & Status (Only shown when Admin is logged in) */}
            {isAdmin && (
              <div
                className="role-indicator admin"
                onClick={() => {
                  setSidebarTab('tools');
                  setSidebarOpen(true);
                }}
                title="Admin Mode Active — Click to open Admin Tools drawer"
                style={{ cursor: 'pointer', boxShadow: 'none' }}
              >
                <span className="role-indicator-dot" />
                <span className="role-indicator-title">🛡️ Admin</span>
              </div>
            )}
          </div>
          )}

          {/* Sidebar toggle - Guaranteed visible & pinned on the far right across all aspect ratios */}
          <button
            className="btn btn-secondary btn-icon nav-hamburger-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Explore Tourist Spots & Route Planner"
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

        {/* Floating banner when Admin is picking a cyan node on the map for a landmark */}
        {assigningNodeForSpot && (
          <div
            className="alignment-selection-banner glass-panel"
            style={{
              borderColor: 'rgba(56, 189, 248, 0.5)',
              background: 'rgba(15, 23, 42, 0.95)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.65)',
            }}
          >
            <span>🎯 Tap any cyan node on the road map to assign it to <strong>{assigningNodeForSpot.name}</strong></span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setAssigningNodeForSpot(null);
                setViewerOpen(true);
              }}
            >
              ✕ Cancel
            </button>
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
            onResetNodesGps={handleResetNodesToGps}
            onCancel={() => {
              setAligningSequence(null);
              setSelectedHandleIndex(null);
            }}
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
            selectedHandleIndex={selectedHandleIndex}
            onSelectHandleIndex={setSelectedHandleIndex}
            onRemoveHandle={handleRemoveHandle}
            onAddHandleNext={handleAddHandleNext}
          />
        )}

        {/* Resize handle */}
        {viewerOpen && (
          <div
            className={`resize-handle ${resizing.current ? 'active' : ''}`}
            onMouseDown={handleResizeStart}
          />
        )}

        {/* Sidebar - Tabs: Tourist Spots, Route Planner */}
        <div className={`sidebar glass-panel ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-tabs-group" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>
              {/* Road & Trail Brand Pill (Tourist Mode: Placed directly among Spots, Routing, and X; Tap 5x for Admin) */}
              {!isAdmin && (
                <div
                  className="brand-pill sidebar-brand-pill"
                  onClick={handleBrandPillTap}
                  role="button"
                  tabIndex={0}
                  title="Road & Trail • Lagangilang Tourism System (Admin Access: Tap 5x)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleBrandPillTap();
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(30, 41, 59, 0.9)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'manipulation',
                    transition: 'transform 0.1s ease',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#f8fafc',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'scale(0.96)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget.style.transform = 'scale(0.96)';
                  }}
                  onTouchEnd={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <span>Road &amp; Trail</span>
                </div>
              )}
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
              {isAdmin && (
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
                    const spotTheme = getPinTheme(spot);
                    return (
                      <div
                        key={spot.id}
                        className={`pano-list-item ${activeTouristSpot?.id === spot.id ? 'active' : ''}`}
                        onClick={() => handleSelectTouristSpot(spot)}
                        style={{ flexDirection: 'column', alignItems: 'stretch' }}
                      >
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          <div style={{ width: '60px', height: '60px', minWidth: '60px', maxWidth: '60px', flexShrink: 0 }}>
                            {(!spot.useStylizedGraphic && (spot.imageUrl || spot.image)) ? (
                              <img
                                src={spot.imageUrl || spot.image}
                                alt={spot.name}
                                className="pano-thumb"
                                style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                              />
                            ) : (
                              <PseudoImage
                                title={spot.name}
                                category={spot.category}
                                categoryIcon={spot.customIcon || spot.icon || spot.cardVisualIcon || spot.categoryIcon || (isPoi ? '🏪' : '⭐')}
                                theme={spot.pseudoTheme || (isPoi ? 'cyan' : 'indigo')}
                                height="60px"
                                width="60px"
                                style={{ borderRadius: 'var(--radius-sm)' }}
                              />
                            )}
                          </div>

                          <div className="pano-info" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h4 style={{ fontSize: '0.88rem', margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {spot.name}
                              </h4>
                            </div>
                            <p style={{ fontSize: '0.72rem', color: spotTheme.color || (isPoi ? '#34d399' : '#ffd700'), margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {spot.customIcon || spot.icon || spot.cardVisualIcon || spot.categoryIcon || (isPoi ? '🏪' : '⭐')} {spot.category} • Brgy. {spot.barangay}
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

          {/* Tab: Tools (Admin Quick-Access Hub - Admin only) */}
          {sidebarTab === 'tools' && isAdmin && (
            <div className="sidebar-body sidebar-tools-container" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Admin Logout Button (Top of Admin Tools) */}
              <button
                className="btn btn-secondary"
                onClick={() => {
                  handleRoleToggle();
                  setSidebarOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🛡️</span>
                  <span>Admin Logout (Exit to Tourist)</span>
                </span>
                <span>➔</span>
              </button>

              {/* Admin Tools Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`btn ${showCustomOSM ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setShowCustomOSM(!showCustomOSM)}
                    style={{
                      flex: 1,
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
                    className="btn btn-secondary"
                    onClick={() => setShowOsmManagerModal(true)}
                    title="Manage, Import & Merge OSM Maps (.osm XML / GeoJSON)"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#93c5fd',
                    }}
                  >
                    ⚙️ Import / Merge
                  </button>
                </div>

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

                {/* Streetview Alignment Cloud Sync & Backup */}
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>
                      🌐 Cloud Streetview Lines
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {Object.keys(streetviewAlignmentService.getAlignedSequences()).length} local active
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      showToast('⏳ Syncing local streetview alignments with Neon Cloud...');
                      const res = await streetviewAlignmentService.pushAllLocalToNeon();
                      if (res.success) {
                        setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
                        showToast(`✅ Synced ${res.pushed} alignments to Neon Cloud! Available on all devices.`);
                      } else {
                        showToast(`⚠️ Sync failed: ${res.error}`);
                      }
                    }}
                    style={{
                      fontSize: '0.78rem',
                      padding: '7px 10px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      borderColor: 'rgba(56, 189, 248, 0.4)',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>☁️ Push Alignments to Cloud Database</span>
                  </button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        const json = streetviewAlignmentService.exportAlignmentsJson();
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `lagangilang_alignments_backup_${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        showToast('📥 Downloaded alignments JSON backup');
                      }}
                      style={{ flex: 1, fontSize: '0.72rem', padding: '5px 8px' }}
                      title="Download local alignments backup file"
                    >
                      📥 Export JSON
                    </button>
                    <label
                      className="btn btn-secondary"
                      style={{ flex: 1, fontSize: '0.72rem', padding: '5px 8px', textAlign: 'center', cursor: 'pointer', margin: 0 }}
                      title="Restore alignments from a JSON backup file"
                    >
                      📤 Import JSON
                      <input
                        type="file"
                        accept=".json"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const text = await file.text();
                            const res = await streetviewAlignmentService.importAlignmentsJson(text);
                            if (res.success) {
                              setAlignedGeoJSON(streetviewAlignmentService.toGeoJSON());
                              showToast(`✅ Imported ${res.imported} alignments and synced to Neon!`);
                            } else {
                              showToast(`⚠️ Import failed: ${res.error}`);
                            }
                          } catch (err) {
                            showToast(`⚠️ Failed to read file: ${err.message}`);
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Sequence & Junction Bridges Master Toggle */}
                <button
                  className={`btn ${showBridgePrompts ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    const next = !showBridgePrompts;
                    setShowBridgePrompts(next);
                    try {
                      localStorage.setItem('lagangilang_show_bridge_prompts', String(next));
                    } catch (_) {}
                    showToast(next ? '🔗 Sequence & Junction Bridges: ON' : '🔗 Sequence & Junction Bridges: OFF (Hidden)');
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
                  <span>🔗 Sequence & Junction Bridges</span>
                  <span>{showBridgePrompts ? '🟢 ON' : '⚪ OFF'}</span>
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
            </div>
          )}

          {/* Tab 2: Route Planner */}
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
              onSetOrigin={setRouteOrigin}
              onSetDestination={setRouteDestination}
              onUseMyLocation={handleUseMyLocation}
              onSwapPoints={handleSwapPoints}
              onSelectRouteIndex={handleSelectRouteIndex}
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

            {/* 360 Viewer: Dedicated Uploaded Panorama (Pannellum), Mapillary or Google Street View */}
            {viewerPanoMode === 'dedicated' ? (
              <PanoramaViewer
                viewerLayout={viewerLayout}
                panorama={activeTouristSpot ? {
                  id: activeTouristSpot.connected360?.targetId || activeTouristSpot.primary_pano_id || null,
                  spotId: activeTouristSpot.id,
                  targetId: activeTouristSpot.connected360?.targetId || null,
                  primaryPanoId: activeTouristSpot.primary_pano_id || null,
                  filename: (activeTouristSpot.connected360?.targetId || activeTouristSpot.primary_pano_id) ? `${activeTouristSpot.connected360?.targetId || activeTouristSpot.primary_pano_id}.jpg` : null,
                  imageUrl:
                    (activeTouristSpot.connected360?.imageUrl && !activeTouristSpot.connected360.imageUrl.includes('/panoramas/pano_null') && !activeTouristSpot.connected360.imageUrl.includes('undefined'))
                      ? activeTouristSpot.connected360.imageUrl
                      : (activeTouristSpot.image && !activeTouristSpot.image.includes('undefined'))
                      ? activeTouristSpot.image
                      : null,
                  heading: activeTouristSpot.connected360?.heading || 0,
                  pitch: activeTouristSpot.connected360?.pitch || 0,
                  lat: activeTouristSpot.location?.lat ?? activeTouristSpot.lat,
                  lng: activeTouristSpot.location?.lng ?? activeTouristSpot.lng,
                  label: activeTouristSpot.name,
                } : null}
                panoramas={localPanoramas}
                viewerHeading={viewerHeading}
                onHeadingChange={setViewerHeading}
                steerTarget={steerTarget}
                onCloseViewer={handleCloseViewer}
                onFallbackToMapillary={handleFallbackToMapillary}
                isAdmin={isAdmin}
                nearestNode={nearestAlignedForActiveSpot}
                onAssignNearestNode={handleAssignNearestNodeToSpot}
                onPickNodeFromMap={handleStartPickNodeFromMap}
              />
            ) : viewerPanoMode === 'mapillary' ? (
              <MapillaryViewer
                imageId={mapillaryImageId || MAPILLARY_CAMPUS_GATE_IMAGE_ID}
                excludedSequences={excludedSequences}
                excludedImageKeys={excludedImageKeys}
                isAdmin={isAdmin}
                onExcludeImage={handleToggleExcludeImage}
                onExcludeSequence={handleToggleExcludeSequence}
                onCalibrateNodePosition={handleCalibrateNodePosition}
                isPinDraggable={pinsDraggable}
                onTogglePinDraggable={() => setPinsDraggable(!pinsDraggable)}
                showToast={showToast}
                viewerLayout={viewerLayout}
                mapWidth={mapWidth}
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
                hasDedicatedCard={!!activeTouristSpot}
                showBridgePrompts={showBridgePrompts}
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
                showBridgePrompts={showBridgePrompts}
                onSwitchToMapillary={(opts) => {
                  setViewerPanoMode('mapillary');
                  const targetLat = opts?.lat ?? activeTouristSpot?.location?.lat ?? activeTouristSpot?.lat ?? streetViewPos?.lat;
                  const targetLng = opts?.lng ?? activeTouristSpot?.location?.lng ?? activeTouristSpot?.lng ?? streetViewPos?.lng;
                  let targetImageId = opts?.imageId;
                  if (!targetImageId && typeof targetLat === 'number' && typeof targetLng === 'number') {
                    const nearest = streetviewAlignmentService.findClosestImageAcrossAll(targetLat, targetLng, Infinity);
                    if (nearest?.image?.id) {
                      targetImageId = String(nearest.image.id);
                    }
                  }
                  if (targetImageId) setMapillaryImageId(targetImageId);
                  if (targetLat && targetLng) {
                    setStreetViewPos({ lat: targetLat, lng: targetLng, id: targetImageId });
                  }
                }}
              />
            )}

            {/* Top-Right Street View Controls (Full Screen & Exit, next to Mapillary playback bar) */}
            <div
              className="streetview-top-right-controls"
              style={{
                position: 'absolute',
                top: 'max(12px, env(safe-area-inset-top, 12px))',
                right: 'max(14px, env(safe-area-inset-right, 14px))',
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                pointerEvents: 'auto',
              }}
            >
              {/* Layout mode switcher: 50/50 Split or Full Browser Screen */}
              <button
                onClick={() => {
                  const nextLayout = viewerLayout === 'fullscreen' ? 'split' : 'fullscreen';
                  setViewerLayout(nextLayout);
                  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
                  setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
                  setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
                }}
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

          {/* Mapillary Image Key Badge & Copy Button (Admin Only per Phase 6) */}
          {isAdmin && contextMenu.imageId && (
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
          {isAdmin && (
            <button
              onClick={() => {
                handleStartAligningAtCoord(contextMenu.lat, contextMenu.lng, contextMenu.sequenceId);
                setContextMenu(null);
              }}
            >
              📐 Bend / Re-align Streetview Line {contextMenu.sequenceId ? `(${contextMenu.sequenceId.slice(0, 8)}...)` : ''}
            </button>
          )}
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
              <button onClick={() => {
                setEditingSpot({
                  spotType: 'poi',
                  category: 'Government & Emergency Services',
                  categoryIcon: '🚨',
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
                🚨 Add Emergency / Hotline / Checkpoint here {contextMenu.imageId ? '📸 (Auto-Linked to Image)' : ''}
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
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>🚫 Excluded Trails & Nodes Manager</h2>
              <button className="btn btn-ghost" onClick={() => setShowExcludedModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Sequences and buggy photo nodes listed here are filtered out from street view traversal and map rendering.
            </p>

            <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#60a5fa' }}>
              Excluded Sequences ({excludedSequences.length})
            </h4>
            {/* Manual sequence exclude input */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
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

            {/* Excluded sequences list */}
            {excludedSequences.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '16px' }}>
                No sequences currently excluded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto', marginBottom: '16px' }}>
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
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fca5a5' }}>
                        Sequence: <code>{seqId}</code>
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

            <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#fbbf24' }}>
              Excluded Photo Nodes / Image Keys ({excludedImageKeys.length})
            </h4>
            {/* Manual image exclude input */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                className="input-field"
                placeholder="Paste Mapillary image ID to exclude..."
                value={manualExcludeImageInput}
                onChange={(e) => setManualExcludeImageInput(e.target.value.trim())}
                style={{ flex: 1, fontSize: '0.85rem' }}
              />
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (manualExcludeImageInput) {
                    handleToggleExcludeImage(manualExcludeImageInput);
                    setManualExcludeImageInput('');
                  }
                }}
                disabled={!manualExcludeImageInput}
                style={{ fontSize: '0.85rem', padding: '6px 14px' }}
              >
                + Exclude
              </button>
            </div>

            {/* Excluded images list */}
            {excludedImageKeys.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                No individual image nodes excluded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                {excludedImageKeys.map((imgId) => (
                  <div
                    key={imgId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fde68a' }}>
                        Image Node: <code>{imgId}</code>
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleToggleExcludeImage(imgId)}
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
        isAdmin={isAdmin}
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

      {/* ===== Emergency Contacts, DENR Checkpoints & Trail Safety Modal ===== */}
      <EmergencyModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        isAdmin={isAdmin}
        showToast={showToast}
        touristSpots={touristSpots}
        onRouteToSpot={(coords) => {
          setRouteDestination(coords);
          setRouteData(null);
          setSidebarTab('routing');
          setSidebarOpen(true);
          if (userLocation) {
            setRouteOrigin([userLocation.lng, userLocation.lat]);
          }
        }}
        onLocateSpot={(spotId) => {
          setShowEmergencyModal(false);
          // Ensure POIs are not hidden by sidebar filter tabs
          setSpotFilter('all');
          setBarangayFilter('all');

          let targetSpot = touristSpots.find((s) => s.id === spotId);
          if (!targetSpot) {
            const allSpots = touristSpotsService.getAllSpots();
            targetSpot = allSpots.find((s) => s.id === spotId);
            if (targetSpot) {
              setTouristSpots(allSpots);
            }
          }

          if (targetSpot) {
            handleSelectTouristSpot(targetSpot);
            showToast?.(`📍 Selected: ${targetSpot.name}`);
          } else {
            showToast?.('📍 Navigating to emergency station location');
          }
        }}
      />

      {/* ===== High-Capacity Offline Map & Data Packager Modal ===== */}
      <OfflineGuideModal
        isOpen={showOfflineModal}
        onClose={() => setShowOfflineModal(false)}
        touristSpots={touristSpots}
        customGeoJSON={alignedGeoJSON}
        showToast={showToast}
      />

      {/* ===== Custom OSM Map Manager & Area Merger Modal ===== */}
      <AdminOsmManagerModal
        isOpen={showOsmManagerModal}
        onClose={() => setShowOsmManagerModal(false)}
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

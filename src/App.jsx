import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MapView from './components/MapView';
import MapillaryViewer from './components/MapillaryViewer';
import PanoramaViewer from './components/PanoramaViewer';
import TouristSpotModal, { LAGANGILANG_BARANGAYS } from './components/TouristSpotModal';
import TouristSpotStreetViewCard from './components/TouristSpotStreetViewCard';
import PseudoImage from './components/PseudoImage';
import { touristSpotsService } from './services/touristSpotsService';
import { useMapillary } from './hooks/useMapillary';
import { formatCoords } from './utils/geoUtils';
import RoutePlanner from './components/RoutePlanner';
import NavigationView from './components/NavigationView';

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
  const [showCustomOSM, setShowCustomOSM] = useState(true);

  // Right-click context menu state: { lat, lng, x, y } | null
  const [contextMenu, setContextMenu] = useState(null);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = useRef(null);

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [pinsDraggable, setPinsDraggable] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Mapillary Street View state
  const [mapillaryImageId, setMapillaryImageId] = useState(null);
  const [streetViewPos, setStreetViewPos] = useState(null);
  const [mapillaryImages, setMapillaryImages] = useState([]);
  const { searchNearby } = useMapillary();

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

  // Right-click / Touchscreen Long-Press context menu handler
  const lastContextMenuTime = useRef(0);
  const handleMapContextMenu = useCallback((lat, lng, screenX, screenY) => {
    lastContextMenuTime.current = Date.now();
    setContextMenu({ lat, lng, x: screenX, y: screenY });
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

    // 2. Background cloud synchronization with Neon PostgreSQL
    touristSpotsService
      .fetchFromCloud()
      .then((cloudSpots) => {
        if (Array.isArray(cloudSpots) && cloudSpots.length > 0) {
          setTouristSpots(cloudSpots);
        }
      })
      .catch(() => {});
  }, []);

  // Filter spots by Tourist Attraction vs Service/POI and Barangay
  const displayedSpots = useMemo(() => {
    return touristSpots.filter((s) => {
      const isPoi = (s.spotType || s.type) === 'poi';
      if (spotFilter === 'tourist_spot' && isPoi) return false;
      if (spotFilter === 'poi' && !isPoi) return false;
      if (barangayFilter !== 'all' && s.barangay !== barangayFilter) return false;
      return true;
    });
  }, [touristSpots, spotFilter, barangayFilter]);

  useEffect(() => {
    loadTouristSpots();
  }, [loadTouristSpots]);

  // Handle selecting a Tourist Spot (POI) from map or sidebar
  const handleSelectTouristSpot = useCallback(
    async (spot) => {
      setActiveTouristSpot(spot);
      setViewerOpen(true);

      const lat = spot.location?.lat ?? spot.lat;
      const lng = spot.location?.lng ?? spot.lng;

      // 1. If landmark has its own dedicated 360 image (uploaded or linked)
      const customPanoId = spot.connected360?.targetId || spot.primary_pano_id;
      const isLocalPano =
        spot.connected360?.type === 'local' ||
        !!spot.connected360?.imageUrl ||
        (customPanoId && String(customPanoId).startsWith('pano_'));

      // Dedicated Mapillary pano ID (exclude the legacy gate fallback 1532761357806896 unless it's actually UA gate)
      const isDedicatedPanoId =
        customPanoId &&
        String(customPanoId).length >= 10 &&
        /^\d+$/.test(String(customPanoId)) &&
        (String(customPanoId) !== '1532761357806896' || spot.id === 'poi_ua_main_gate');

      if (isLocalPano) {
        setStreetViewPos({ lat, lng, id: String(customPanoId || spot.id) });
      } else if (isDedicatedPanoId) {
        setMapillaryImageId(String(customPanoId));
        setStreetViewPos({ lat, lng, id: String(customPanoId) });
      } else {
        // 2. Otherwise auto-detect and load nearest street view
        try {
          const images = await searchNearby(lat, lng, 350);
          if (images && images.length > 0) {
            setMapillaryImageId(String(images[0].id));
            setStreetViewPos({ lat: images[0].lat, lng: images[0].lng, id: String(images[0].id) });
          } else {
            // Default sequence fallback: UA campus entrance gate
            setMapillaryImageId('1532761357806896');
            setStreetViewPos({ lat: 17.6081389, lng: 120.7381389, id: '1532761357806896' });
          }
        } catch (e) {
          console.warn('Could not find nearby street view:', e);
          setMapillaryImageId('1532761357806896');
        }
      }

      // 3. Orient the 360 viewer toward the landmark's heading
      if (spot.connected360?.heading !== undefined) {
        setSteerTarget({
          heading: spot.connected360.heading,
          pitch: spot.connected360.pitch || 0,
          key: Date.now(),
        });
      }
    },
    [searchNearby]
  );

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

  // Close viewer
  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    setMapillaryImageId(null);
    setStreetViewPos(null);
    setActiveTouristSpot(null);
  }, []);

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

  const stagedCount = touristSpots.filter((s) => s.sync_status === 'staged_local').length;

  if (isNavigating && routeData) {
    return <NavigationView routeData={routeData} onExit={handleExitNavigation} />;
  }

  return (
    <div className="app-container">
      {/* ===== Map Panel ===== */}
      <div
        className={`panel-map ${!viewerOpen ? 'expanded' : ''} ${viewerLayout === 'fullscreen' ? 'fullscreen-collapsed' : ''} ${isAdmin ? 'admin-mode' : ''}`}
        style={viewerOpen && viewerLayout === 'split' ? { flex: `0 0 ${mapWidth}%` } : {}}
      >
        {/* Map top controls */}
        <div className="map-overlay-top">
          {/* Role Indicator Badge */}
          <div
            className={`role-indicator ${isAdmin ? 'admin' : 'tourist'}`}
            onClick={() => {
              const next = !isAdmin;
              setIsAdmin(next);
              showToast(
                next
                  ? '🛡️ Admin Panel active — Marker dragging & location marking enabled'
                  : '🌴 Tourist Explorer active — Explore map & navigate 360 street views'
              );
            }}
            title={isAdmin ? 'Switch to Tourist Explorer' : 'Switch to Admin Panel'}
          >
            <span className="role-indicator-dot" />
            <span>{isAdmin ? '🛡️ Admin Panel' : '🌴 Tourist Explorer'}</span>
          </div>

          {/* Theme Selector */}
          <div
            className="theme-toggle"
            style={{
              display: 'flex',
              gap: '4px',
              background: 'rgba(0,0,0,0.6)',
              padding: '4px',
              borderRadius: 'var(--radius-full)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {['dark', 'light', 'beige', 'satellite'].map((t) => (
              <button
                key={t}
                className={`mode-toggle-btn ${mapTheme === t ? 'active' : ''}`}
                onClick={() => {
                  setMapTheme(t);
                  localStorage.setItem('lagangilang_map_theme', t);
                }}
                style={{ textTransform: 'capitalize', fontSize: '0.8rem', padding: '4px 8px' }}
              >
                {t}
              </button>
            ))}
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
            }}
          >
            🧭 Route
          </button>

          <div className="controls-separator" />

          {/* Admin-only controls */}
          {isAdmin && (
            <>
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
                }}
              >
                🗺️ Custom Map
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
                }}
              >
                ⭐ + Add Spot
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
                  gap: '6px',
                }}
              >
                <span>{pinsDraggable ? '🔓 Reposition ON' : '🔒 Pins Locked'}</span>
              </button>

              {/* Online/Offline indicator */}
              <div
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
                }}
                title={isOnline ? 'Online • Neon PostgreSQL connected' : 'Offline • Field staging buffer active'}
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
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </div>

              {/* Staged Drafts */}
              {stagedCount > 0 && (
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
                    border: '1px solid #f59e0b',
                    color: '#fbbf24',
                    background: 'rgba(245, 158, 11, 0.2)',
                    animation: 'pulse 2s infinite',
                  }}
                  title="Locally staged drafts pending verification/sync"
                >
                  🟡 {stagedCount} Staged
                </button>
              )}
            </>
          )}

          {/* Sidebar toggle (always visible) */}
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Explore Tourist Spots & Route Planner"
            style={{ marginLeft: 'auto' }}
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

        {/* 2D MapView */}
        <MapView
          theme={mapTheme}
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
              : [120.738083, 17.60825] // Lagangilang, Abra
          }
          mapZoom={15}
          routeGeoJSON={routeData?.geometry || null}
          routeOrigin={routeOrigin}
          routeDestination={routeDestination}
          routingMode={routingMode || !!pickingTarget}
          pickingMode={pickingTarget}
          isAdmin={isAdmin}
          isDraggable={isAdmin && pinsDraggable}
        />

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
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                onClick={() => setSidebarTab('spots')}
                style={{
                  background: sidebarTab === 'spots' ? 'var(--accent-primary)' : 'transparent',
                  color: sidebarTab === 'spots' ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⭐ Spots ({touristSpots.length})
              </button>
              {isAdmin && stagedCount > 0 && (
                <button
                  onClick={() => setSidebarTab('staging')}
                  style={{
                    background: sidebarTab === 'staging' ? '#f59e0b' : 'rgba(245,158,11,0.2)',
                    color: sidebarTab === 'staging' ? '#1a1a2e' : '#fbbf24',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🟡 Staged ({stagedCount})
                </button>
              )}
              <button
                onClick={() => setSidebarTab('routing')}
                style={{
                  background: sidebarTab === 'routing' ? 'var(--accent-primary)' : 'transparent',
                  color: sidebarTab === 'routing' ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🧭 Routing
              </button>
            </div>

            <button className="btn btn-ghost" onClick={() => setSidebarOpen(false)}>
              ✕
            </button>
          </div>

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

      {/* ===== 360 Viewer Panel (Powered Exclusively by Mapillary) ===== */}
      <div
        className={`panel-viewer ${!viewerOpen ? 'hidden' : ''} ${viewerLayout === 'fullscreen' ? 'fullscreen-viewer' : ''}`}
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

            {/* 360 Viewer: Dedicated Uploaded Panorama (Pannellum) or Public Street View (Mapillary) */}
            {activeTouristSpot &&
            (activeTouristSpot.connected360?.type === 'local' ||
              !!activeTouristSpot.connected360?.imageUrl ||
              String(activeTouristSpot.connected360?.targetId || '').startsWith('pano_')) ? (
              <PanoramaViewer
                panorama={{
                  id: activeTouristSpot.connected360?.targetId || activeTouristSpot.id,
                  filename: `${activeTouristSpot.connected360?.targetId || activeTouristSpot.id}.jpg`,
                  imageUrl:
                    activeTouristSpot.connected360?.imageUrl ||
                    activeTouristSpot.image ||
                    `${API_BASE}/panoramas/${activeTouristSpot.connected360?.targetId}.jpg`,
                  heading: activeTouristSpot.connected360?.heading || 0,
                  pitch: activeTouristSpot.connected360?.pitch || 0,
                  lat: activeTouristSpot.location?.lat ?? activeTouristSpot.lat,
                  lng: activeTouristSpot.location?.lng ?? activeTouristSpot.lng,
                  label: activeTouristSpot.name,
                }}
                panoramas={[]}
                viewerHeading={viewerHeading}
                onHeadingChange={setViewerHeading}
                steerTarget={steerTarget}
              />
            ) : (
              <MapillaryViewer
                imageId={mapillaryImageId || '1532761357806896'}
                onPositionChange={(pos) => {
                  setMapillaryImageId(pos.id);
                  setStreetViewPos(pos);
                }}
                onHeadingChange={setViewerHeading}
                steerTarget={steerTarget}
              />
            )}

            {/* Floating info badge on right-center with layout switcher */}
            <div className="mapillary-info-badge">
              <span style={{ fontSize: '1rem' }}>🟢</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  Street View
                </div>
                <div style={{ fontSize: '0.65rem', opacity: 0.75, whiteSpace: 'nowrap' }}>
                  Lagangilang, Abra
                </div>
              </div>

              {/* Layout mode switcher: 50/50 Split or Full Browser Screen */}
              <button
                onClick={() => setViewerLayout(viewerLayout === 'fullscreen' ? 'split' : 'fullscreen')}
                title={viewerLayout === 'fullscreen' ? 'Restore to 50/50 Half Screen' : 'Expand to Full Browser Screen'}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  padding: '3px 8px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {viewerLayout === 'fullscreen' ? '◫ 50/50 Split' : '⛶ Full Screen'}
              </button>

              <button
                onClick={handleCloseViewer}
                title="Close street view"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#86efac',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  padding: '0 0 0 4px',
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
            <span>{contextMenu.lat.toFixed(6)}, {contextMenu.lng.toFixed(6)}</span>
            <button
              title="Copy coordinates"
              onClick={() => {
                navigator.clipboard.writeText(`${contextMenu.lat.toFixed(6)}, ${contextMenu.lng.toFixed(6)}`);
                setContextMenu(null);
              }}
            >
              📋 Copy
            </button>
          </div>
          <hr />
          <button onClick={() => { setRouteOrigin([contextMenu.lng, contextMenu.lat]); setRouteData(null); setContextMenu(null); }}>
            🟢 Mark as Point A (Start)
          </button>
          <button onClick={() => { setRouteDestination([contextMenu.lng, contextMenu.lat]); setRouteData(null); setContextMenu(null); }}>
            🏁 Mark as Point B (Destination)
          </button>
          {isAdmin && (
            <>
              <hr />
              <button onClick={() => {
                setEditingSpot({ spotType: 'tourist_spot', location: { lat: contextMenu.lat, lng: contextMenu.lng, address: '' } });
                setShowSpotModal(true);
                setContextMenu(null);
              }}>
                ⭐ Add Tourist Spot here
              </button>
              <button onClick={() => {
                setEditingSpot({ spotType: 'poi', location: { lat: contextMenu.lat, lng: contextMenu.lng, address: '' } });
                setShowSpotModal(true);
                setContextMenu(null);
              }}>
                📌 Add Point of Interest here
              </button>
            </>
          )}
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
          loadTouristSpots();
          handleSelectTouristSpot(saved);
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

      {/* ===== Floating Toast Notification ===== */}
      {toastMessage && (
        <div className="app-toast-notification">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

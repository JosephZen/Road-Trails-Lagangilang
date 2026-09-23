import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapView from './components/MapView';
import PanoramaViewer from './components/PanoramaViewer';
import MapillaryViewer from './components/MapillaryViewer';
import MiniMap from './components/MiniMap';
import UploadModal from './components/UploadModal';
import TouristSpotModal from './components/TouristSpotModal';
import TouristSpotStreetViewCard from './components/TouristSpotStreetViewCard';
import PseudoImage from './components/PseudoImage';
import { touristSpotsService, findNearestPanorama } from './services/touristSpotsService';
import { usePreloader } from './hooks/usePreloader';
import { useMapillary } from './hooks/useMapillary';
import { formatCoords } from './utils/geoUtils';
import RoutePlanner from './components/RoutePlanner';
import NavigationView from './components/NavigationView';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * Main application shell.
 * Split-screen layout: Map (left) | Panorama Viewer (right).
 * Supports Local mode (Pannellum) and Cloud mode (Mapillary).
 * Fullstack integration with Neon PostgreSQL, offline 2-step staging, and Lagangilang tourist spots.
 */
export default function App() {
  // App state
  const [mode, setMode] = useState('local'); // 'local' | 'cloud'
  const [panoramas, setPanoramas] = useState([]);
  const [activePano, setActivePano] = useState(null);
  const [viewerHeading, setViewerHeading] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('spots'); // 'spots' | 'panoramas' | 'staging'
  
  // Tourist Spots & POI State
  const [touristSpots, setTouristSpots] = useState([]);
  const [activeTouristSpot, setActiveTouristSpot] = useState(null);
  const [showSpotModal, setShowSpotModal] = useState(false);
  const [editingSpot, setEditingSpot] = useState(null);
  const [steerTarget, setSteerTarget] = useState(null);
  const [showCoverageGaps, setShowCoverageGaps] = useState(true);

  // Routing State
  const [routingMode, setRoutingMode] = useState(false);
  const [routingProfile, setRoutingProfile] = useState('driving');
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [routeDestination, setRouteDestination] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showCustomOSM, setShowCustomOSM] = useState(true);

  // Connectivity & 2-Step Sync State (Research Objective 3: ISO/IEC 25010 Reliability)
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Theme & Auth State
  const [mapTheme, setMapTheme] = useState('dark'); // 'dark' | 'light' | 'beige' | 'satellite'
  const [isAdmin, setIsAdmin] = useState(true);
  const [editingDescId, setEditingDescId] = useState(null);
  const [descText, setDescText] = useState('');

  // Mapillary state
  const [mapillaryImageId, setMapillaryImageId] = useState(null);
  const [mapillaryImages, setMapillaryImages] = useState([]);
  const { searchNearby } = useMapillary();

  // Preloader for local mode
  const { preloadStatus, getCachedUrl } = usePreloader(
    activePano?.id,
    panoramas
  );

  // Map resize
  const [mapWidth, setMapWidth] = useState(45); // percentage
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

  // Initialize Tourist Spots
  const loadTouristSpots = useCallback(() => {
    const spots = touristSpotsService.getAllSpots();
    setTouristSpots(spots);
  }, []);

  useEffect(() => {
    loadTouristSpots();
  }, [loadTouristSpots]);

  // Fetch panoramas from backend or local storage
  const fetchPanoramas = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/panoramas`);
      if (res.ok) {
        const data = await res.json();
        setPanoramas(data.panoramas || []);
      }
    } catch (err) {
      console.warn('Backend not running, checking local panoramas fallback');
      // If backend is not active, look in public metadata or fallback
      try {
        const localMeta = await fetch('/panoramas/metadata.json');
        if (localMeta.ok) {
          const d = await localMeta.json();
          setPanoramas(d.panoramas || []);
        }
      } catch (e) {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    fetchPanoramas();
  }, [fetchPanoramas]);

  // Handle selecting a panorama from the map
  const handleSelectPano = useCallback(
    (pano) => {
      if (mode === 'local') {
        setActivePano(pano);
        setViewerOpen(true);
      } else {
        // In cloud mode, search for Mapillary images near this point
        searchNearby(pano.lat, pano.lng).then((images) => {
          setMapillaryImages(images);
          if (images.length > 0) {
            setMapillaryImageId(images[0].id);
            setViewerOpen(true);
          }
        });
      }
    },
    [mode, searchNearby]
  );

  // Handle selecting a Tourist Spot (POI) from map or sidebar
  const handleSelectTouristSpot = useCallback(
    (spot) => {
      setActiveTouristSpot(spot);
      setViewerOpen(true);

      const lat = spot.location?.lat ?? spot.lat;
      const lng = spot.location?.lng ?? spot.lng;

      // 1. Check if spot has connected 360 panorama ID
      if (spot.connected360?.targetId) {
        const target = panoramas.find((p) => p.id === spot.connected360.targetId);
        if (target) {
          setActivePano(target);
          setMode('local');
        } else {
          // If not in local panoramas, find nearest panorama
          const nearest = findNearestPanorama(lat, lng, panoramas);
          if (nearest) {
            setActivePano(nearest);
            setMode('local');
          }
        }
      } else {
        // Find nearest panorama by coordinates
        const nearest = findNearestPanorama(lat, lng, panoramas);
        if (nearest) {
          setActivePano(nearest);
          setMode('local');
        }
      }

      // 2. Orient the 360 viewer toward the landmark's heading
      if (spot.connected360?.heading !== undefined) {
        setSteerTarget({
          heading: spot.connected360.heading,
          pitch: spot.connected360.pitch || 0,
          key: Date.now(),
        });
      }
    },
    [panoramas]
  );

  // Steering camera helper
  const handleSteerHeading = useCallback((heading, pitch) => {
    setSteerTarget({
      heading,
      pitch,
      key: Date.now(),
    });
  }, []);

  // Handle navigating to a neighbor panorama (bullet view)
  const handleNavigate = useCallback((neighborPano) => {
    setActivePano(neighborPano);
  }, []);

  // Save Description Update for Panorama
  const saveDescription = async (panoId) => {
    try {
      const res = await fetch(`${API_BASE}/api/panoramas/${panoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descText }),
      });
      if (res.ok) {
        setEditingDescId(null);
        fetchPanoramas();
        if (activePano?.id === panoId) {
          setActivePano((prev) => ({ ...prev, description: descText }));
        }
      }
    } catch (err) {
      console.error('Failed to update description:', err);
    }
  };

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
    if (window.confirm('Delete this tourist spot?')) {
      touristSpotsService.deleteSpot(spotId);
      if (activeTouristSpot?.id === spotId) {
        setActiveTouristSpot(null);
      }
      loadTouristSpots();
    }
  };

  // Handle map click for routing mode
  const handleMapClickForRouting = useCallback((lat, lng) => {
    if (!routeOrigin) {
      setRouteOrigin([lng, lat]);
    } else if (!routeDestination) {
      setRouteDestination([lng, lat]);
    }
  }, [routeOrigin, routeDestination]);

  // Handle clicking on the map — works in both modes
  const handleMapClick = useCallback(
    async (lat, lng, clickedMapillaryId) => {
      if (routingMode) {
        handleMapClickForRouting(lat, lng);
        return;
      }
      
      // If we clicked on a Mapillary feature (green line/dot)
      if (clickedMapillaryId) {
        setMode('cloud');
        setMapillaryImageId(clickedMapillaryId);
        setViewerOpen(true);
        return;
      }

      // If we clicked on a Mapillary sequence (no direct ID), search nearby
      if (mode === 'cloud') {
        const images = await searchNearby(lat, lng);
        setMapillaryImages(images);
        if (images.length > 0) {
          setMapillaryImageId(images[0].id);
          setViewerOpen(true);
        }
      }
    },
    [mode, searchNearby]
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
    setActivePano(null);
    setMapillaryImageId(null);
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
        className={`panel-map ${!viewerOpen ? 'expanded' : ''}`}
        style={viewerOpen ? { flex: `0 0 ${mapWidth}%` } : {}}
      >
        {/* Map top controls */}
        <div className="map-overlay-top">
          {/* Mode Toggle */}
          <div className="mode-toggle">
            <button
              className={`mode-toggle-btn ${mode === 'local' ? 'active' : ''}`}
              onClick={() => setMode('local')}
            >
              📁 Local
            </button>
            <button
              className={`mode-toggle-btn ${mode === 'cloud' ? 'active' : ''}`}
              onClick={() => setMode('cloud')}
            >
              ☁ Cloud
            </button>
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
                onClick={() => setMapTheme(t)}
                style={{ textTransform: 'capitalize', fontSize: '0.8rem', padding: '4px 8px' }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Coverage Gaps Toggle (Research Objective 1) */}
          <button
            className={`btn ${showCoverageGaps ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowCoverageGaps(!showCoverageGaps)}
            title="Toggle Lagangilang Trail Corridors & Coverage Gaps (Objective 1)"
            style={{
              fontSize: '0.8rem',
              padding: '6px 10px',
              borderRadius: 'var(--radius-full)',
              background: showCoverageGaps
                ? 'linear-gradient(135deg, #06d6a0 0%, #059669 100%)'
                : 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#ffffff',
            }}
          >
            🗺️ Gaps {showCoverageGaps ? 'ON' : 'OFF'}
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
            }}
          >
            🗺️ Custom Map
          </button>

          {/* Offline / Online Network Indicator (Objective 3: Reliability) */}
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
            <span>{isOnline ? 'Online' : 'Offline Buffer'}</span>
          </div>

          {/* Staged Drafts Indicator & Quick Sync */}
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

          {/* Admin Mode Toggle */}
          <button
            className={`btn ${isAdmin ? 'btn-primary' : 'btn-secondary'} btn-icon`}
            onClick={() => setIsAdmin(!isAdmin)}
            title={isAdmin ? 'Admin Mode Active' : 'User Mode'}
            style={{ fontSize: '0.9rem', width: 'auto', padding: '0 12px' }}
          >
            {isAdmin ? '🛡️ Admin' : '👤 User'}
          </button>

          {/* Add Tourist Spot Button (Admin) */}
          {isAdmin && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingSpot(null);
                setShowSpotModal(true);
              }}
              title="Add Tourist Spot (POI) with Pseudo-Image and 360 link"
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
          )}

          {/* Upload Panorama Button (Admin only) */}
          {isAdmin && (
            <button
              className="btn btn-primary btn-icon"
              onClick={() => setShowUpload(true)}
              title="Upload 360° panorama"
              style={{ fontSize: '1.2rem' }}
            >
              +
            </button>
          )}

          {/* Sidebar toggle */}
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Explore Tourist Spots & Panoramas"
          >
            ☰
          </button>
        </div>

        {/* 2D MapView */}
        <MapView
          theme={mapTheme}
          panoramas={panoramas}
          activePanoId={activePano?.id}
          onSelectPano={handleSelectPano}
          onMapClick={handleMapClick}
          viewerHeading={viewerHeading}
          touristSpots={touristSpots}
          activeTouristSpotId={activeTouristSpot?.id}
          onSelectTouristSpot={handleSelectTouristSpot}
          showCoverageGaps={showCoverageGaps}
          showCustomOSM={showCustomOSM}
          mapCenter={
            activePano
              ? [activePano.lng, activePano.lat]
              : [120.738083, 17.60825] // Lagangilang, Abra
          }
          mapZoom={15}
          routeGeoJSON={routeData?.geometry || null}
          routeOrigin={routeOrigin}
          routeDestination={routeDestination}
        />

        {/* Resize handle */}
        {viewerOpen && (
          <div
            className={`resize-handle ${resizing.current ? 'active' : ''}`}
            onMouseDown={handleResizeStart}
          />
        )}

        {/* Sidebar - Tabs: Tourist Spots, Panoramas, Staging Queue */}
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
              <button
                onClick={() => setSidebarTab('panoramas')}
                style={{
                  background: sidebarTab === 'panoramas' ? 'var(--accent-primary)' : 'transparent',
                  color: sidebarTab === 'panoramas' ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                📍 360s ({panoramas.length})
              </button>
              {stagedCount > 0 && (
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

            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
              ✕
            </button>
          </div>

          {/* Tab 1: Tourist Spots (POIs) */}
          {sidebarTab === 'spots' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Lagangilang Tourist Attractions
                </span>
                {isAdmin && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '2px 6px', color: '#ffd700' }}
                    onClick={() => {
                      setEditingSpot(null);
                      setShowSpotModal(true);
                    }}
                  >
                    + New Spot
                  </button>
                )}
              </div>

              {touristSpots.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                  No tourist spots recorded.
                </p>
              ) : (
                <div className="pano-list">
                  {touristSpots.map((spot) => (
                    <div
                      key={spot.id}
                      className={`pano-list-item ${activeTouristSpot?.id === spot.id ? 'active' : ''}`}
                      onClick={() => handleSelectTouristSpot(spot)}
                      style={{
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        borderLeft: `3px solid ${
                          spot.sync_status === 'staged_local' ? '#f59e0b' : '#ffd700'
                        }`,
                      }}
                    >
                      {/* Image or Pseudo-Image Header */}
                      <div style={{ borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: '6px' }}>
                        {spot.image ? (
                          <img
                            src={spot.image}
                            alt={spot.name}
                            style={{ width: '100%', height: '85px', objectFit: 'cover' }}
                          />
                        ) : (
                          <PseudoImage
                            title={spot.name}
                            category={spot.category}
                            theme={spot.pseudoTheme || 'indigo'}
                            height="80px"
                            showWatermark={false}
                          />
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ fontSize: '0.85rem', margin: '0 0 2px 0' }}>{spot.name}</h4>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            Brgy. {spot.barangay}
                          </span>
                        </div>
                        {spot.sync_status === 'staged_local' && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: '#f59e0b',
                              color: '#1a1a2e',
                              fontWeight: 700,
                            }}
                          >
                            STAGED
                          </span>
                        )}
                      </div>

                      {/* Interactive Description Snippet */}
                      <p
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          margin: '4px 0 0 0',
                          lineHeight: 1.35,
                          cursor: 'pointer',
                        }}
                        title="Click to view 360°"
                      >
                        {spot.description.slice(0, 110)}...
                      </p>

                      {/* Admin Actions */}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
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
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: 360 Panoramas */}
          {sidebarTab === 'panoramas' && (
            <div>
              {panoramas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No panoramas yet.</p>
                  {isAdmin && (
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: '12px' }}
                      onClick={() => {
                        setSidebarOpen(false);
                        setShowUpload(true);
                      }}
                    >
                      + Upload First Image
                    </button>
                  )}
                </div>
              ) : (
                <div className="pano-list">
                  {panoramas.map((pano) => (
                    <div
                      key={pano.id}
                      className={`pano-list-item ${activePano?.id === pano.id ? 'active' : ''}`}
                      onClick={() => handleSelectPano(pano)}
                    >
                      {pano.thumbnail && (
                        <img
                          className="pano-thumb"
                          src={`${API_BASE}/panoramas/${pano.thumbnail}`}
                          alt={pano.label || pano.id}
                        />
                      )}
                      <div className="pano-info" style={{ flex: 1 }}>
                        <h4>{pano.label || pano.id}</h4>
                        <p style={{ fontSize: '0.75rem', marginBottom: '4px' }}>
                          {formatCoords(pano.lat, pano.lng)}
                        </p>

                        {/* Description editor */}
                        {editingDescId === pano.id ? (
                          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '8px' }}>
                            <textarea
                              className="input-field"
                              value={descText}
                              onChange={(e) => setDescText(e.target.value)}
                              placeholder="Add POI description..."
                              style={{ width: '100%', minHeight: '60px', padding: '4px', fontSize: '0.8rem' }}
                            />
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                              <button
                                className="btn btn-primary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => saveDescription(pano.id)}
                              >
                                Save
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => setEditingDescId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: '4px' }}>
                            <p
                              style={{
                                fontSize: '0.8rem',
                                color: 'var(--text-color)',
                                fontStyle: pano.description ? 'normal' : 'italic',
                                opacity: 0.8,
                              }}
                            >
                              {pano.description || (isAdmin ? 'No description yet' : '')}
                            </p>
                            {isAdmin && (
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '2px 6px', fontSize: '0.7rem', marginTop: '4px', opacity: 0.7 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDescText(pano.description || '');
                                  setEditingDescId(pano.id);
                                }}
                              >
                                ✎ Edit Description
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: 2-Step Offline Staging Queue */}
          {sidebarTab === 'staging' && (
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
                          {spot.location.address}
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

          {/* Tab 4: Route Planner */}
          {sidebarTab === 'routing' && (
            <RoutePlanner
              routeOrigin={routeOrigin}
              routeDestination={routeDestination}
              routeData={routeData}
              routingProfile={routingProfile}
              routingMode={routingMode}
              isNavigating={isNavigating}
              onSetRoutingMode={setRoutingMode}
              onSetProfile={setRoutingProfile}
              onClearRoute={handleClearRoute}
              onRouteCalculated={handleRouteCalculated}
              onStartNavigation={handleStartNavigation}
            />
          )}
        </div>
      </div>

      {/* ===== Viewer Panel ===== */}
      <div className={`panel-viewer ${!viewerOpen ? 'hidden' : ''}`}>
        {viewerOpen && (
          <>
            {/* Top bar with location info */}
            <div className="viewer-top-bar glass-panel-sm">
              <div className="viewer-location-info">
                <div className="location-icon">
                  {activeTouristSpot ? '⭐' : mode === 'local' ? '📍' : '☁'}
                </div>
                <div className="location-text">
                  <h3>
                    {activeTouristSpot?.name || activePano?.label || activePano?.id || 'Mapillary View'}
                  </h3>
                  <p>
                    {activeTouristSpot
                      ? `${activeTouristSpot.location.address} (${activeTouristSpot.location.lat.toFixed(4)}, ${activeTouristSpot.location.lng.toFixed(4)})`
                      : activePano
                      ? formatCoords(activePano.lat, activePano.lng)
                      : 'Cloud imagery'}
                    {mode === 'local' && activePano?.heading !== undefined && (
                      <span> • Heading: {Math.round(viewerHeading)}°</span>
                    )}
                  </p>
                </div>
              </div>

              <button
                className="btn btn-ghost"
                onClick={handleCloseViewer}
                title="Close viewer"
                style={{ fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            {/* Floating Tourist Spot Street View Overlay Card */}
            {activeTouristSpot && (
              <TouristSpotStreetViewCard
                spot={activeTouristSpot}
                onClose={() => setActiveTouristSpot(null)}
                onNavigateTo360={handleSelectTouristSpot}
                onSteerHeading={handleSteerHeading}
                isViewerOpen={viewerOpen}
              />
            )}

            {/* Panorama Viewer */}
            {mode === 'local' && activePano ? (
              <>
                <PanoramaViewer
                  panorama={activePano}
                  panoramas={panoramas}
                  viewerHeading={viewerHeading}
                  getCachedUrl={getCachedUrl}
                  onNavigate={handleNavigate}
                  onHeadingChange={setViewerHeading}
                  steerTarget={steerTarget}
                />

                {/* Preload status indicator */}
                <div className="preload-indicator glass-panel-sm">
                  <div className={`preload-dot ${preloadStatus.loading ? 'loading' : ''}`} />
                  <span>
                    {preloadStatus.loading ? 'Preloading...' : `${preloadStatus.cached} cached`}
                  </span>
                </div>
              </>
            ) : mode === 'cloud' && mapillaryImageId ? (
              <MapillaryViewer
                imageId={mapillaryImageId}
                onPositionChange={(pos) => {
                  setActivePano({
                    id: pos.id,
                    lat: pos.lat,
                    lng: pos.lng,
                    label: `Mapillary ${pos.id}`,
                  });
                  setMapillaryImageId(pos.id);
                }}
                onHeadingChange={setViewerHeading}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🌐</div>
                <h3>No panorama selected</h3>
                <p>Click on a marker on the map to view a 360° panorama</p>
              </div>
            )}

            {/* Mini map in viewer */}
            {activePano && (
              <MiniMap
                theme={mapTheme}
                lat={activePano.lat}
                lng={activePano.lng}
                heading={viewerHeading}
                panoramas={panoramas}
                onSelectPano={handleSelectPano}
              />
            )}

            {/* Floating toolbar */}
            <div className="floating-toolbar glass-panel-sm">
              <button
                className={`toolbar-btn ${mode === 'local' ? 'active' : ''}`}
                onClick={() => setMode('local')}
                title="Local mode"
              >
                📁
              </button>
              <div className="toolbar-divider" />
              <button
                className={`toolbar-btn ${mode === 'cloud' ? 'active' : ''}`}
                onClick={() => setMode('cloud')}
                title="Cloud mode (Mapillary)"
              >
                ☁
              </button>
              <div className="toolbar-divider" />
              {isAdmin && (
                <button
                  className="toolbar-btn"
                  onClick={() => setShowUpload(true)}
                  title="Upload panorama"
                >
                  📤
                </button>
              )}
            </div>
          </>
        )}
      </div>

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
        availablePanoramas={panoramas}
        editingSpot={editingSpot}
      />

      {/* ===== Upload Modal ===== */}
      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onUploadComplete={fetchPanoramas}
      />
    </div>
  );
}
